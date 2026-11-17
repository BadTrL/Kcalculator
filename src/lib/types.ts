export type Unit = 'g' | 'ml' | 'u'

/** Régime compatible : 'vegan' (aucun produit animal) ou 'vege' (végétarien : œufs, lait, miel possibles). */
export type Diet = 'vege' | 'vegan'

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
  diet?: Diet | null // null = contient de la viande / du poisson, ou non renseigné
  updated_at: string
  deleted?: boolean
}

/** Numéro du repas dans la journée : 1, 2, 3… */
export type Meal = number

/** Nombre de repas affichés par défaut dans le journal. */
export const DEFAULT_MEALS_PER_DAY = 4

/** Anciens créneaux nommés (avant les repas numérotés) et leur numéro. */
export const LEGACY_MEALS: Record<string, Meal> = { Matin: 1, Midi: 2, Collation: 3, Soir: 4 }

export const mealLabel = (m: Meal) => `Repas ${m}`

export interface Entry {
  id: string
  date: string // YYYY-MM-DD
  meal: Meal
  food_id: string
  qty: number // g, ml ou nombre d'unités
  updated_at: string
  deleted?: boolean
}

/** Infos d'un repas d'une journée (l'heure, pour l'instant). id = « AAAA-MM-JJ|n ». */
export interface MealInfo {
  id: string
  date: string // YYYY-MM-DD
  meal: Meal
  time: string | null // HH:MM, facultatif
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
  /** Cheat meals marqués dans le journal, clés « AAAA-MM-JJ|Repas ». Synchronisé avec le profil. */
  cheatMeals?: string[]
  /** Nombre de repas affichés chaque jour dans le journal (4 par défaut). */
  mealsPerDay?: number
  updated_at: string
}

export interface Macros {
  protein: number
  carbs: number
  fat: number
  kcal: number
}

export interface MenuItem {
  food_id: string
  qty: number
}

/** Repas déjà calculé, enregistré pour être réutilisé. */
export interface Menu {
  id: string
  name: string
  items: MenuItem[] // quantités totales à cuisiner
  portions?: number // batch cooking : nombre de repas / portions (1 par défaut)
  updated_at: string
  deleted?: boolean
}
