import { DEFAULT_MEALS_PER_DAY, LEGACY_MEALS, type Meal } from './types'

/**
 * Repas numérotés (Repas 1, Repas 2…).
 * Les anciennes données utilisaient des créneaux nommés (Matin, Midi, Collation, Soir) :
 * on les convertit à la lecture, que ce soit depuis l'appareil ou depuis Supabase.
 */

/** Numéro de repas à partir d'une valeur stockée : 2, '2' ou un ancien nom comme 'Midi'. */
export function toMeal(raw: unknown): Meal {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.round(raw))
  if (typeof raw === 'string') {
    if (raw in LEGACY_MEALS) return LEGACY_MEALS[raw]
    const n = parseInt(raw, 10)
    if (Number.isFinite(n)) return Math.max(1, n)
  }
  return 1
}

/** Identifiant des infos d'un repas (heure) et clé des cheat meals : « AAAA-MM-JJ|n ». */
export const mealKey = (date: string, meal: Meal) => `${date}|${meal}`

/** Convertit les clés de cheat meals « date|Midi » en « date|2 ». */
export function normalizeCheatKeys(list: string[] | undefined): string[] | undefined {
  if (!list) return list
  const out = list.map((k) => mealKey(k.slice(0, 10), toMeal(k.slice(11))))
  return Array.from(new Set(out)).sort()
}

/** Liste des repas à afficher : au moins `perDay`, plus tous ceux déjà utilisés ce jour-là. */
export function mealsOfDay(perDay: number | undefined, used: Iterable<Meal>): Meal[] {
  let n = Math.max(1, Math.round(perDay ?? DEFAULT_MEALS_PER_DAY))
  for (const m of used) n = Math.max(n, m)
  return Array.from({ length: n }, (_, i) => i + 1)
}

/** Heure saisie (« 7:5 », « 07:05 ») → « HH:MM », ou null si vide / invalide. */
export function normalizeTime(raw: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{1,2})/.exec((raw ?? '').trim())
  if (!m) return null
  const h = +m[1]
  const min = +m[2]
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** Repas le plus probable selon l'heure, parmi `count` repas (pour présélectionner un choix). */
export function guessMeal(count: number, hour = new Date().getHours()): Meal {
  // Journée « utile » de 7 h à 21 h, découpée en parts égales.
  const n = Math.max(1, count)
  const i = Math.floor(((Math.min(21, Math.max(7, hour)) - 7) / 14) * n)
  return Math.min(n, i + 1)
}
