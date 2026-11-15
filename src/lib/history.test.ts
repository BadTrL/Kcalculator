import { describe, expect, it } from 'vitest'
import { average, dailyTotals, monthGrid } from './history'
import type { Entry, Food } from './types'

const rice: Food = { id: 'riz', name: 'Riz', unit: 'g', protein: 7, carbs: 78, fat: 1, kcal: 357, updated_at: '' }
const e = (id: string, date: string, qty: number, deleted = false): Entry => ({ id, date, meal: 'Midi', food_id: 'riz', qty, updated_at: '', deleted })

describe('historique', () => {
  it('additionne les aliments de chaque jour et ignore les suppressions', () => {
    const t = dailyTotals({ a: e('a', '2026-11-14', 100), b: e('b', '2026-11-14', 50), c: e('c', '2026-11-15', 100, true) }, { riz: rice })
    expect(Object.keys(t)).toEqual(['2026-11-14'])
    expect(t['2026-11-14'].kcal).toBeCloseTo(535.5)
  })

  it('construit un mois qui commence le lundi', () => {
    const g = monthGrid(2026, 11) // le 1er novembre 2026 est un dimanche
    expect(g.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01'])
    expect(g[g.length - 1]).toBe('2026-11-30')
    expect(monthGrid(2026, 2).filter(Boolean)).toHaveLength(28)
  })

  it('fait la moyenne des jours enregistrés', () => {
    expect(average([])).toBeNull()
    expect(average([{ kcal: 2000, protein: 100, carbs: 200, fat: 60 }, { kcal: 2400, protein: 140, carbs: 250, fat: 80 }])?.kcal).toBe(2200)
  })
})
