-- Kcalculator, migration 006 : micronutriments des aliments + lien avec l'appli santé (HealthE, fork d'OpenStrap Edge).
-- À lancer UNE fois sur un projet Supabase déjà installé : Supabase > SQL Editor > New query,
-- coller ce fichier, puis "Run". On peut le relancer sans erreur.
--
-- Sans cette migration l'appli marche quand même : les micronutriments restent sur l'appareil
-- et seront envoyés à la première synchro qui suit la migration.

-- 1. Micronutriments des aliments, pour 100 g / 100 ml / 1 unité comme les macros.
--    null = inconnu (jamais zéro par défaut). Fibres, sucres, AG saturés en g ; sodium, fer, calcium en mg.
alter table public.foods add column if not exists fibre real;
alter table public.foods add column if not exists sugar real;
alter table public.foods add column if not exists sat_fat real;
alter table public.foods add column if not exists sodium real;
alter table public.foods add column if not exists iron real;
alter table public.foods add column if not exists calcium real;

-- 2. Résumé santé d'une journée, écrit par l'appli santé (une ligne par jour), lu par Kcalculator et le coach.
create table if not exists public.health_daily (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  date date not null,
  source text not null default '',           -- ex. « healthe:whoop5 »
  active_kcal real,                          -- calories actives du jour
  total_kcal real,                           -- dépense totale du jour (repos + activité)
  steps integer,
  sleep_min real,
  hrv_ms real,
  resting_hr real,
  weight_kg real,
  body_fat_pct real,                         -- 0..100
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  primary key (user_id, date)
);

drop trigger if exists health_daily_synced on public.health_daily;
create trigger health_daily_synced before insert or update on public.health_daily
  for each row execute function public.touch_synced_at();
create index if not exists health_daily_synced_idx on public.health_daily (user_id, synced_at);

alter table public.health_daily enable row level security;
drop policy if exists "own health" on public.health_daily;
create policy "own health" on public.health_daily for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Ce que l'appli santé lit : le total nutritionnel de chaque jour (une ligne par jour), pas le détail des aliments.
--    Les micros ne comptent que les aliments qui les renseignent : `micros_complete` dit si tous les aliments du jour les ont.
--    Un jour dont tout a été supprimé reste visible avec 0, pour que l'appli santé efface aussi ce jour.
--    security_invoker : la vue applique les règles d'accès (RLS) de la personne connectée.
create or replace view public.nutrition_daily with (security_invoker = true) as
select
  e.user_id,
  e.date,
  count(*) filter (where x.ok) as items,
  coalesce(sum(f.kcal * x.k) filter (where x.ok), 0) as kcal,
  coalesce(sum(f.protein * x.k) filter (where x.ok), 0) as protein_g,
  coalesce(sum(f.carbs * x.k) filter (where x.ok), 0) as carbs_g,
  coalesce(sum(f.fat * x.k) filter (where x.ok), 0) as fat_g,
  sum(f.fibre * x.k) filter (where x.ok) as fibre_g,
  sum(f.sugar * x.k) filter (where x.ok) as sugar_g,
  sum(f.sat_fat * x.k) filter (where x.ok) as sat_fat_g,
  sum(f.sodium * x.k) filter (where x.ok) as sodium_mg,
  sum(f.iron * x.k) filter (where x.ok) as iron_mg,
  sum(f.calcium * x.k) filter (where x.ok) as calcium_mg,
  coalesce(bool_and(f.fibre is not null and f.sugar is not null and f.sat_fat is not null
    and f.sodium is not null and f.iron is not null and f.calcium is not null) filter (where x.ok), true) as micros_complete,
  max(greatest(e.updated_at, f.updated_at)) as updated_at,
  max(greatest(e.synced_at, f.synced_at)) as synced_at
from public.entries e
join public.foods f on f.user_id = e.user_id and f.id = e.food_id
cross join lateral (
  select case when f.unit = 'u' then e.qty else e.qty / 100.0 end as k, not e.deleted and not f.deleted as ok
) x
group by e.user_id, e.date;

grant select on public.nutrition_daily to authenticated;

-- Recharge le cache de l'API pour qu'elle voie tout de suite les nouveautés.
notify pgrst, 'reload schema';
