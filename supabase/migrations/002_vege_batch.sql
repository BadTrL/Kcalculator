-- Kcalculator, migration 002 : catégorie végé / vegan et batch cooking.
-- À lancer UNE fois sur un projet Supabase déjà installé avec schema.sql :
-- Supabase > SQL Editor > New query, coller ce fichier, puis "Run".
-- Sans risque pour les données existantes : on ajoute seulement deux colonnes avec une valeur par défaut,
-- et on peut relancer le script sans erreur.

-- Aliments : 'vegan', 'vege' (végétarien) ou null (viande / poisson, ou non renseigné).
alter table public.foods add column if not exists diet text;
alter table public.foods drop constraint if exists foods_diet_check;
alter table public.foods add constraint foods_diet_check check (diet is null or diet in ('vege', 'vegan'));

-- Menus : nombre de repas / portions pour le batch cooking (1 = repas normal).
alter table public.menus add column if not exists portions integer not null default 1;
alter table public.menus drop constraint if exists menus_portions_check;
alter table public.menus add constraint menus_portions_check check (portions >= 1);

-- Recharge le cache de l'API pour qu'elle voie tout de suite les nouvelles colonnes.
notify pgrst, 'reload schema';
