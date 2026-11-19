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
  // Micronutriments, mêmes unités de référence (100 g / 100 ml / 1 unité). null ou absent = inconnu (pas zéro).
  fibre?: number | null // g
  sugar?: number | null // g
  sat_fat?: number | null // g
  sodium?: number | null // mg
  iron?: number | null // mg
  calcium?: number | null // mg
  updated_at: string
  deleted?: boolean
}

/** Résumé santé d'une journée, envoyé par l'appli santé (HealthE / Edge) dans Supabase. Lecture seule ici. */
export interface HealthDay {
  date: string // YYYY-MM-DD
  source: string // ex. « healthe:whoop5 »
  active_kcal: number | null
  total_kcal: number | null
  steps: number | null
  sleep_min: number | null
  hrv_ms: number | null
  resting_hr: number | null
  weight_kg: number | null
  body_fat_pct: number | null // 0..100
  updated_at: string
}

/** Numéro du repas dans la journée : 1, 2, 3… */
export type Meal = number

/** Nombre de repas affichés par défaut dans le journal : un seul, le bouton + en ajoute d'autres. */
export const DEFAULT_MEALS_PER_DAY = 1

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
  /** Ancien réglage « repas par jour » (avant la v4). N'est plus utilisé : le journal part d'un seul repas. */
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

/** Ingrédient proposé par l'IA : un aliment de Mes aliments (food_id) ou un nouvel aliment estimé (food_id null). */
export interface ProposalItem {
  name: string
  food_id: string | null
  qty: number
  unit: Unit
  /** Estimation de l'IA pour cette quantité (sert pour un nouvel aliment). */
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/** Proposition du coach (outil) : un repas à ajouter au journal ou un menu à enregistrer, à confirmer. */
export interface CoachProposal {
  kind: 'journal' | 'menu'
  name: string
  date?: string
  meal?: Meal
  time?: string // HH:MM
  portions?: number
  items: ProposalItem[]
  comment?: string
  /** Rempli une fois la proposition confirmée (ex. « Ajouté au repas 2 du 18 nov. »). */
  done?: string
}

/** Un message d'une discussion avec le coach. */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Propositions du coach attachées à sa réponse. */
  proposals?: CoachProposal[]
}

/** Discussion avec le coach IA, gardée dans l'historique et synchronisée. */
export interface Chat {
  id: string
  title: string
  messages: ChatMessage[]
  updated_at: string
  deleted?: boolean
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
