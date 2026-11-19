import { factor } from './calc'
import type { Food } from './types'

/** Micronutriments suivis : les mêmes que le journal alimentaire d'Edge / HealthE. */
export const MICROS = [
  { key: 'fibre', label: 'Fibres', unit: 'g' },
  { key: 'sugar', label: 'Sucres', unit: 'g' },
  { key: 'sat_fat', label: 'AG saturés', unit: 'g' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
  { key: 'iron', label: 'Fer', unit: 'mg' },
  { key: 'calcium', label: 'Calcium', unit: 'mg' },
] as const

export type MicroKey = (typeof MICROS)[number]['key']
export type Micros = Record<MicroKey, number | null>

export const NO_MICROS: Micros = { fibre: null, sugar: null, sat_fat: null, sodium: null, iron: null, calcium: null }

/** Micros d'une quantité d'aliment. Une valeur inconnue reste inconnue (null), jamais zéro. */
export function microsFor(food: Food, qty: number): Micros {
  const f = factor(food, qty)
  const out = { ...NO_MICROS }
  for (const { key } of MICROS) {
    const v = food[key]
    out[key] = typeof v === 'number' && Number.isFinite(v) ? v * f : null
  }
  return out
}

/** Total d'une liste : `partial` dit si au moins un aliment ne renseigne pas ce micro. */
export function sumMicros(list: Micros[]): { total: Record<MicroKey, number>; partial: Record<MicroKey, boolean>; known: Record<MicroKey, boolean> } {
  const total = {} as Record<MicroKey, number>
  const partial = {} as Record<MicroKey, boolean>
  const known = {} as Record<MicroKey, boolean>
  for (const { key } of MICROS) {
    total[key] = 0
    partial[key] = false
    known[key] = false
    for (const m of list) {
      const v = m[key]
      if (v === null) partial[key] = true
      else {
        total[key] += v
        known[key] = true
      }
    }
  }
  return { total, partial, known }
}
