import { describe, expect, it } from 'vitest'
import { average, dailyTotals, level, monthGrid, weekOf } from './history'
import type { Entry, Food } from './types'

const rice: Food = { id: 'riz', name: 'Riz', unit: 'g', protein: 7, carbs: 78, fat: 1, kcal: 357, updated_at: '' }
const e = (id: string, date: string, qty: number, deleted = false): Entry => ({ id, date, meal: 2, food_id: 'riz', qty, updated_at: '', deleted })

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

describe('weekOf et level', () => {
  it('donne la semaine du lundi au dimanche', () => {
    expect(weekOf('2026-11-15')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])
    expect(weekOf('2026-11-09')[0]).toBe('2026-11-09')
    expect(weekOf('2026-01-01')[0]).toBe('2025-12-29')
  })
  it('classe un jour selon l’objectif ±10 %', () => {
    expect(level(2000, 2500)).toBe('low')
    expect(level(2600, 2500)).toBe('ok')
    expect(level(2800, 2500)).toBe('high')
  })
})
