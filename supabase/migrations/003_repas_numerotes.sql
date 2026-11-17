-- Kcalculator, migration 003 : repas numérotés (Repas 1, Repas 2…) et heure facultative de chaque repas.
-- À lancer UNE fois sur un projet Supabase déjà installé : Supabase > SQL Editor > New query,
-- coller ce fichier, puis "Run". On peut le relancer sans erreur.
--
-- Sans risque pour les données : les anciens créneaux sont renommés en numéros
-- (Matin → 1, Midi → 2, Collation → 3, Soir → 4), dans le même ordre qu'avant.
-- La colonne entries.meal reste du texte pour que les appareils pas encore à jour
-- puissent continuer à synchroniser ; l'appli convertit aussi elle-même les anciens noms.

update public.entries set meal = case meal
    when 'Matin' then '1'
    when 'Midi' then '2'
    when 'Collation' then '3'
    when 'Soir' then '4'
  end
  where meal in ('Matin', 'Midi', 'Collation', 'Soir');

-- Cheat meals (dans le profil) : « 2026-11-17|Midi » devient « 2026-11-17|2 ».
update public.profiles p set data = jsonb_set(p.data, '{cheatMeals}', (
    select coalesce(jsonb_agg(distinct
      case
        when k like '%|Matin' then left(k, 10) || '|1'
        when k like '%|Midi' then left(k, 10) || '|2'
        when k like '%|Collation' then left(k, 10) || '|3'
        when k like '%|Soir' then left(k, 10) || '|4'
        else k
      end), '[]'::jsonb)
    from jsonb_array_elements_text(p.data -> 'cheatMeals') as k
  ))
  where jsonb_typeof(p.data -> 'cheatMeals') = 'array'
    and exists (select 1 from jsonb_array_elements_text(p.data -> 'cheatMeals') as k where k ~ '\|(Matin|Midi|Collation|Soir)$');

-- Infos de chaque repas d'une journée : pour l'instant son heure (facultative).
-- id = « AAAA-MM-JJ|numéro du repas ».
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

drop trigger if exists meals_synced on public.meals;
create trigger meals_synced before insert or update on public.meals
  for each row execute function public.touch_synced_at();
create index if not exists meals_synced_idx on public.meals (user_id, synced_at);

alter table public.meals enable row level security;
drop policy if exists "own meals" on public.meals;
create policy "own meals" on public.meals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Recharge le cache de l'API pour qu'elle voie tout de suite la nouvelle table.
notify pgrst, 'reload schema';
