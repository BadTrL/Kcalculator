import { describe, expect, it } from 'vitest'
import { bmr, macrosFor, maintenance, targetKcal, targets } from './calc'
import type { Food, Profile } from './types'

// Valeurs du fichier "Calculateur Macro.xlsx" de Sacha.
const p: Profile = {
  weight: 90,
  bodyFat: 0.23,
  activity: 1.45,
  surplus: 0.1,
  deficit: 0.25,
  proteinCoef: 2.2,
  fatCoef: 0.9,
  goal: 'seche',
  updated_at: '',
}

describe('calculs', () => {
  it('reproduit le métabolisme de base et la maintenance de l\'Excel', () => {
    expect(bmr(p)).toBeCloseTo(370 + 21.6 * 69.3, 5) // 1866.88
    expect(maintenance(p)).toBeCloseTo(2706.976, 2)
  })

  it('arrondit les objectifs à 50 kcal', () => {
    expect(targetKcal(p)).toBe(2050) // 2030.2 -> 2050
    expect(targetKcal({ ...p, goal: 'masse' })).toBe(3000) // 2977.7 -> 3000
  })

  it('répartit les macros', () => {
    const t = targets(p)
    expect(t.protein).toBe(150) // 152.46
    expect(t.fat).toBe(60) // 62.37
  })

  it('gère les aliments à l\'unité', () => {
    const egg: Food = { id: '1', name: 'oeuf', unit: 'u', protein: 6.8, carbs: 0.4, fat: 5.6, kcal: 79, updated_at: '' }
    expect(macrosFor(egg, 3).kcal).toBeCloseTo(237)
    const rice: Food = { ...egg, unit: 'g', kcal: 357 }
    expect(macrosFor(rice, 50).kcal).toBeCloseTo(178.5)
  })
})
