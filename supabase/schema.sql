-- Kcalculator : schéma Supabase.
-- À coller dans Supabase > SQL Editor > New query, puis "Run".

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
  deleted boolean not null default false,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.entries (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  id text not null,
  date date not null,
  meal text not null,
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

create index if not exists foods_synced_idx on public.foods (user_id, synced_at);
create index if not exists entries_synced_idx on public.entries (user_id, synced_at);
create index if not exists menus_synced_idx on public.menus (user_id, synced_at);

-- Chaque compte ne voit et ne modifie que ses propres données.
alter table public.foods enable row level security;
alter table public.entries enable row level security;
alter table public.menus enable row level security;
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
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
