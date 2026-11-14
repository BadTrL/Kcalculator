import { macrosFor, sum } from './calc'
import type { Entry, Food, Macros } from './types'

/** Total kcal / macros de chaque jour qui a au moins un aliment dans le journal. */
export function dailyTotals(entries: Record<string, Entry>, foods: Record<string, Food>): Record<string, Macros> {
  const byDay: Record<string, Macros[]> = {}
  for (const e of Object.values(entries)) {
    if (e.deleted) continue
    const f = foods[e.food_id]
    if (!f) continue
    ;(byDay[e.date] ??= []).push(macrosFor(f, e.qty))
  }
  return Object.fromEntries(Object.entries(byDay).map(([d, list]) => [d, sum(list)]))
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Cases d'un mois pour un calendrier qui commence le lundi : null pour les cases vides
 * avant le 1er, puis les dates AAAA-MM-JJ. month va de 1 à 12.
 */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay() // 0 = dimanche
  const lead = (first + 6) % 7
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const out: (string | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= days; d++) out.push(`${year}-${pad(month)}-${pad(d)}`)
  return out
}

/** Moyenne par jour enregistré d'une liste de totaux journaliers. */
export function average(list: Macros[]): Macros | null {
  if (list.length === 0) return null
  const t = sum(list)
  const n = list.length
  return { kcal: t.kcal / n, protein: t.protein / n, carbs: t.carbs / n, fat: t.fat / n }
}
