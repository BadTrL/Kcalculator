import { describe, expect, it } from 'vitest'
import { microsFor, sumMicros } from './micros'
import { parseOff } from './off'
import type { Food } from './types'

const food = (over: Partial<Food>): Food => ({ id: 'x', name: 'x', unit: 'g', protein: 0, carbs: 0, fat: 0, kcal: 0, updated_at: '', ...over })

describe('micronutriments', () => {
  it('calcule pour la quantité et garde inconnu ce qui n’est pas renseigné', () => {
    const m = microsFor(food({ fibre: 4, sodium: 400 }), 250)
    expect(m.fibre).toBe(10)
    expect(m.sodium).toBe(1000)
    expect(m.iron).toBeNull()
  })

  it('compte par unité pour les aliments à l’unité', () => {
    expect(microsFor(food({ unit: 'u', calcium: 30 }), 3).calcium).toBe(90)
  })

  it('signale un total incomplet', () => {
    const s = sumMicros([microsFor(food({ fibre: 2 }), 100), microsFor(food({}), 100)])
    expect(s.total.fibre).toBe(2)
    expect(s.partial.fibre).toBe(true)
    expect(s.known.fibre).toBe(true)
    expect(s.known.iron).toBe(false)
  })

  it('lit les micros d’Open Food Facts en mg pour sodium, fer, calcium', () => {
    const p = parseOff({ product_name: 'Pain', nutriments: { fiber_100g: 6.5, sodium_100g: 0.48, iron_100g: 0.0021, 'saturated-fat_100g': '0.3' } })
    expect(p.fibre).toBe(6.5)
    expect(p.sodium).toBe(480)
    expect(p.iron).toBe(2.1)
    expect(p.sat_fat).toBe(0.3)
    expect(p.calcium).toBeNull()
    expect(p.sugar).toBeNull()
  })
})
