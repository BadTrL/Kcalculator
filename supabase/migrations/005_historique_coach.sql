-- Kcalculator, migration 005 : historique des discussions avec le coach IA, synchronisé entre appareils.
-- À lancer UNE fois sur un projet Supabase déjà installé : Supabase > SQL Editor > New query,
-- coller ce fichier, puis "Run". On peut le relancer sans erreur.
--
-- Sans cette migration l'appli marche quand même : l'historique reste sur l'appareil
-- et sera envoyé à la première synchro qui suit la migration.

create table if not exists public.chats (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  id text not null,
  title text not null default '',
  messages jsonb not null default '[]',
  deleted boolean not null default false,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

drop trigger if exists chats_synced on public.chats;
create trigger chats_synced before insert or update on public.chats
  for each row execute function public.touch_synced_at();
create index if not exists chats_synced_idx on public.chats (user_id, synced_at);

alter table public.chats enable row level security;
drop policy if exists "own chats" on public.chats;
create policy "own chats" on public.chats for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Recharge le cache de l'API pour qu'elle voie tout de suite la nouvelle table.
notify pgrst, 'reload schema';
