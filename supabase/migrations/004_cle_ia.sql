-- Kcalculator, migration 004 : ta clé API Anthropic, saisie dans Réglages > Intelligence artificielle.
-- À lancer UNE fois sur un projet Supabase déjà installé : Supabase > SQL Editor > New query,
-- coller ce fichier, puis "Run". On peut le relancer sans erreur.
--
-- Comment la clé est protégée (comme un mot de passe) :
--   - elle est chiffrée par Supabase Vault (table vault.secrets), jamais stockée en clair ;
--   - l'appli peut seulement l'écrire ou la supprimer (fonctions set_ai_key / delete_ai_key) ;
--   - l'appli ne peut relire que ses 4 derniers caractères (table ai_keys, colonne hint) ;
--   - seule la fonction Edge « ai » (rôle service_role) peut la déchiffrer, via get_ai_key.
-- Le secret global ANTHROPIC_API_KEY de la fonction « ai » reste utilisé en repli.

create extension if not exists supabase_vault with schema vault;

-- Une ligne par compte : où est la clé dans le Vault, et ses 4 derniers caractères pour l'affichage.
create table if not exists public.ai_keys (
  user_id uuid primary key references auth.users on delete cascade,
  secret_id uuid not null,
  hint text not null,
  updated_at timestamptz not null default now()
);

alter table public.ai_keys enable row level security;

-- Lecture de sa propre ligne seulement (l'indice, pas la clé). Aucune écriture directe :
-- tout passe par les fonctions ci-dessous.
revoke all on public.ai_keys from anon, authenticated;
grant select (user_id, hint, updated_at) on public.ai_keys to authenticated;
drop policy if exists "own ai key" on public.ai_keys;
create policy "own ai key" on public.ai_keys for select
  using (auth.uid() = user_id);

-- Enregistre ou remplace la clé du compte connecté. Renvoie l'indice (4 derniers caractères).
create or replace function public.set_ai_key(p_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_key text := btrim(coalesce(p_key, ''));
  v_id uuid;
  v_hint text;
begin
  if v_uid is null then
    raise exception 'Connecte-toi pour enregistrer une clé.' using errcode = '42501';
  end if;
  if v_key !~ '^sk-ant-[A-Za-z0-9_-]{20,250}$' then
    raise exception 'Ce n''est pas une clé API Anthropic (elle commence par sk-ant-).' using errcode = '22023';
  end if;
  v_hint := right(v_key, 4);

  select secret_id into v_id from public.ai_keys where user_id = v_uid;
  if v_id is not null and exists (select 1 from vault.secrets where id = v_id) then
    perform vault.update_secret(v_id, v_key);
  else
    -- Nom unique par compte dans le Vault.
    delete from vault.secrets where name = 'kcalculator_ai_key_' || v_uid;
    v_id := vault.create_secret(v_key, 'kcalculator_ai_key_' || v_uid, 'Clé API Anthropic (Kcalculator)');
  end if;

  insert into public.ai_keys (user_id, secret_id, hint, updated_at)
    values (v_uid, v_id, v_hint, now())
    on conflict (user_id) do update set secret_id = excluded.secret_id, hint = excluded.hint, updated_at = now();
  return v_hint;
end;
$$;

-- Supprime la clé du compte connecté (le secret est effacé du Vault par le déclencheur plus bas).
create or replace function public.delete_ai_key()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connecte-toi pour supprimer ta clé.' using errcode = '42501';
  end if;
  delete from public.ai_keys where user_id = auth.uid();
end;
$$;

-- Déchiffre la clé d'un compte. Réservé à la fonction Edge « ai » (service_role).
create or replace function public.get_ai_key(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret
  from public.ai_keys k
  join vault.decrypted_secrets d on d.id = k.secret_id
  where k.user_id = p_user;
$$;

-- Efface le secret du Vault quand la ligne disparaît (suppression de la clé ou du compte).
create or replace function public.ai_keys_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.secret_id;
  return old;
end;
$$;

drop trigger if exists ai_keys_cleanup on public.ai_keys;
create trigger ai_keys_cleanup after delete on public.ai_keys
  for each row execute function public.ai_keys_cleanup();

-- Droits : l'appli (authenticated) peut écrire et supprimer sa clé, jamais la relire.
revoke all on function public.set_ai_key(text) from public, anon;
revoke all on function public.delete_ai_key() from public, anon;
revoke all on function public.get_ai_key(uuid) from public, anon, authenticated;
revoke all on function public.ai_keys_cleanup() from public, anon, authenticated;
grant execute on function public.set_ai_key(text) to authenticated;
grant execute on function public.delete_ai_key() to authenticated;
grant execute on function public.get_ai_key(uuid) to service_role;
