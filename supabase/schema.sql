-- Kcalculator : schéma Supabase.
-- À coller dans Supabase > SQL Editor > New query, puis "Run".
-- Nouveau projet : ce fichier suffit. Projet déjà installé : lance les fichiers de supabase/migrations/.

create table if not exists public.foods (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  id text not null,
  name text not null,
  unit text not null check (unit in ('g', 'ml', 'u')),
  protein real not null default 0,
  carbs real not null default 0,
  fat real not null default 0,
  kcal real not null default 0,
  barcode text,
  brand text,
  diet text check (diet is null or diet in ('vege', 'vegan')),
  deleted boolean not null default false,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.entries (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  id text not null,
  date date not null,
  meal text not null, -- numéro du repas : '1', '2'… (anciennement 'Matin', 'Midi'…)
  food_id text not null,
  qty real not null,
  deleted boolean not null default false,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.menus (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  id text not null,
  name text not null,
  items jsonb not null default '[]',
  portions integer not null default 1 check (portions >= 1),
  deleted boolean not null default false,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Infos de chaque repas d'une journée (heure facultative). id = « AAAA-MM-JJ|numéro du repas ».
create table if not exists public.meals (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  id text not null,
  date date not null,
  meal integer not null check (meal >= 1),
  "time" text check ("time" is null or "time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  deleted boolean not null default false,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users on delete cascade default auth.uid(),
  data jsonb not null,
  updated_at timestamptz not null
);

-- synced_at = heure d'arrivée sur le serveur ; sert à savoir quoi récupérer sur les autres appareils.
create or replace function public.touch_synced_at() returns trigger language plpgsql as $$
begin
  new.synced_at := now();
  return new;
end $$;

drop trigger if exists foods_synced on public.foods;
create trigger foods_synced before insert or update on public.foods
  for each row execute function public.touch_synced_at();
drop trigger if exists entries_synced on public.entries;
create trigger entries_synced before insert or update on public.entries
  for each row execute function public.touch_synced_at();
drop trigger if exists menus_synced on public.menus;
create trigger menus_synced before insert or update on public.menus
  for each row execute function public.touch_synced_at();
drop trigger if exists meals_synced on public.meals;
create trigger meals_synced before insert or update on public.meals
  for each row execute function public.touch_synced_at();

create index if not exists foods_synced_idx on public.foods (user_id, synced_at);
create index if not exists entries_synced_idx on public.entries (user_id, synced_at);
create index if not exists menus_synced_idx on public.menus (user_id, synced_at);
create index if not exists meals_synced_idx on public.meals (user_id, synced_at);

-- Chaque compte ne voit et ne modifie que ses propres données.
alter table public.foods enable row level security;
alter table public.entries enable row level security;
alter table public.menus enable row level security;
alter table public.meals enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "own foods" on public.foods;
create policy "own foods" on public.foods for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own entries" on public.entries;
create policy "own entries" on public.entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own menus" on public.menus;
create policy "own menus" on public.menus for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own meals" on public.meals;
create policy "own meals" on public.meals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Clé API Anthropic de chaque compte (Réglages > Intelligence artificielle), chiffrée par Supabase Vault.
-- Détails : migrations/004_cle_ia.sql.
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
