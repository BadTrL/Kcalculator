import type { Food, Macros, Profile } from './types'

export const ACTIVITY_LEVELS = [
  { value: 1.15, label: 'Peu ou pas de sport' },
  { value: 1.25, label: 'Sport 1-2 fois / semaine' },
  { value: 1.4, label: 'Sport 3-5 fois / semaine' },
  { value: 1.55, label: 'Sport 6-7 fois / semaine' },
  { value: 1.7, label: 'Sport 6-7 fois + travail physique' },
]

export const mround = (x: number, m: number) => Math.round(x / m) * m

export function leanMass(p: Pick<Profile, 'weight' | 'bodyFat'>) {
  return p.weight * (1 - p.bodyFat)
}

/** Métabolisme de base, formule de Katch-McArdle (identique au fichier Excel). */
export function bmr(p: Pick<Profile, 'weight' | 'bodyFat'>) {
  return 370 + 21.6 * leanMass(p)
}

export function maintenance(p: Profile) {
  return bmr(p) * p.activity
}

/** Objectif calorique du jour, arrondi à 50 kcal comme dans l'Excel. */
export function targetKcal(p: Profile) {
  const m = maintenance(p)
  if (p.goal === 'seche') return mround(m * (1 - p.deficit), 50)
  if (p.goal === 'masse') return mround(m * (1 + p.surplus), 50)
  return mround(m, 50)
}

/** Répartition des macros : protéines et lipides en g/kg de masse maigre, glucides = le reste. */
export function targets(p: Profile): Macros {
  const kcal = targetKcal(p)
  const lm = leanMass(p)
  const protein = p.proteinCoef * lm
  const fat = p.fatCoef * lm
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4)
  return { kcal, protein: mround(protein, 5), fat: mround(fat, 5), carbs: mround(carbs, 5) }
}

export function factor(food: Pick<Food, 'unit'>, qty: number) {
  return food.unit === 'u' ? qty : qty / 100
}

export function macrosFor(food: Food, qty: number): Macros {
  const f = factor(food, qty)
  return { protein: food.protein * f, carbs: food.carbs * f, fat: food.fat * f, kcal: food.kcal * f }
}

export function sum(list: Macros[]): Macros {
  return list.reduce(
    (a, b) => ({ protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, kcal: a.kcal + b.kcal }),
    { protein: 0, carbs: 0, fat: 0, kcal: 0 },
  )
}

export function unitLabel(food: Pick<Food, 'unit'>) {
  return food.unit === 'u' ? 'pour 1 unité' : `pour 100 ${food.unit}`
}
