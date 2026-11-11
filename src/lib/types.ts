export type Unit = 'g' | 'ml' | 'u'

/** Valeurs nutritionnelles pour 100 g / 100 ml, ou pour 1 unité si unit === 'u'. */
export interface Food {
  id: string
  name: string
  unit: Unit
  protein: number
  carbs: number
  fat: number
  kcal: number
  barcode?: string | null
  brand?: string | null
  updated_at: string
  deleted?: boolean
}

export const MEALS = ['Matin', 'Midi', 'Collation', 'Soir'] as const
export type Meal = (typeof MEALS)[number]

export interface Entry {
  id: string
  date: string // YYYY-MM-DD
  meal: Meal
  food_id: string
  qty: number // g, ml ou nombre d'unités
  updated_at: string
  deleted?: boolean
}

export type Goal = 'seche' | 'maintien' | 'masse'

export interface Profile {
  weight: number // kg
  bodyFat: number // 0..1
  activity: number // multiplicateur
  surplus: number // 0..1 (prise de masse)
  deficit: number // 0..1 (sèche)
  proteinCoef: number // g / kg de masse maigre
  fatCoef: number // g / kg de masse maigre
  goal: Goal
  updated_at: string
}

export interface Macros {
  protein: number
  carbs: number
  fat: number
  kcal: number
}
