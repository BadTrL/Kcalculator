import { describe, expect, it } from 'vitest'
import { coachContext, photoContext } from './aiContext'
import type { Entry, Food, Profile } from './types'

const T = '2026-01-01T00:00:00.000Z'
const profile: Profile = { weight: 80, bodyFat: 0.2, activity: 1.4, surplus: 0.1, deficit: 0.2, proteinCoef: 2, fatCoef: 1, goal: 'seche', updated_at: T }
const foods: Record<string, Food> = {
  riz: { id: 'riz', name: 'Riz cuit', unit: 'g', protein: 2.7, carbs: 28, fat: 0.3, kcal: 130, updated_at: T },
  oeuf: { id: 'oeuf', name: 'Œuf', unit: 'u', protein: 6, carbs: 0.5, fat: 5, kcal: 70, updated_at: T },
}
const e = (id: string, date: string, food_id: string, qty: number, meal: Entry['meal'] = 2): Entry => ({ id, date, meal, food_id, qty, updated_at: T })

describe('photoContext', () => {
  it('donne la cible et ce qui reste', () => {
    const txt = photoContext({ profile, foods, entries: { a: e('a', '2026-03-10', 'riz', 200) } }, '2026-03-10')
    expect(txt).toContain('sèche')
    expect(txt).toContain('Déjà mangé ce jour-là : 260 kcal')
  })
})

describe('coachContext', () => {
  it('détaille le jour et résume les jours précédents', () => {
    const entries = {
      a: e('a', '2026-03-10', 'oeuf', 2, 1),
      b: e('b', '2026-03-09', 'riz', 100),
      c: { ...e('c', '2026-03-08', 'riz', 100), deleted: true },
      d: e('d', '2026-02-01', 'riz', 100), // trop ancien
    }
    const txt = coachContext({ profile, foods, entries }, '2026-03-10')
    expect(txt).toContain('- Repas 1 : Œuf 2 u (140 kcal')
    expect(txt).toContain('- 2026-03-09 : 130 kcal')
    expect(txt).not.toContain('2026-03-08')
    expect(txt).not.toContain('2026-02-01')
    expect(txt).toContain('Moyenne des jours notés sur 7 jours : 130 kcal')
  })

  it('gère un journal vide', () => {
    const txt = coachContext({ profile, foods, entries: {} }, '2026-03-10')
    expect(txt).toContain('rien noté')
    expect(txt).toContain('aucun jour noté')
  })
})
