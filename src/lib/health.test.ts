import { describe, expect, it } from 'vitest'
import { coachContext } from './aiContext'
import { energyBalance, healthLine, sleepLabel } from './health'
import type { HealthDay, Profile } from './types'

const h = (over: Partial<HealthDay>): HealthDay => ({
  date: '2026-03-10', source: 'healthe:whoop5', active_kcal: null, total_kcal: null, steps: null, sleep_min: null,
  hrv_ms: null, resting_hr: null, weight_kg: null, body_fat_pct: null, updated_at: '', ...over,
})

describe('bilan santé', () => {
  it('calcule le solde mangé − dépensé', () => {
    expect(energyBalance(2200, h({ total_kcal: 2700 }))).toBe(-500)
    expect(energyBalance(2200, h({ active_kcal: 600 }))).toBeNull()
    expect(energyBalance(2200, undefined)).toBeNull()
  })

  it('formate le sommeil', () => {
    expect(sleepLabel(445)).toBe('7 h 25')
  })

  it('résume la journée pour le coach', () => {
    expect(healthLine(h({ total_kcal: 2700, active_kcal: 650, sleep_min: 420 }))).toBe('dépense totale 2700 kcal, dont active 650 kcal, sommeil 7 h 00')
  })

  it('ajoute les données du bracelet au contexte du coach', () => {
    const profile: Profile = { weight: 80, bodyFat: 0.2, activity: 1.4, surplus: 0.1, deficit: 0.2, proteinCoef: 2, fatCoef: 1, goal: 'seche', updated_at: '' }
    const txt = coachContext({ profile, foods: {}, entries: {}, health: { '2026-03-09': h({ date: '2026-03-09', total_kcal: 2650 }) } }, '2026-03-10')
    expect(txt).toContain('Bracelet')
    expect(txt).toContain('2026-03-09 : dépense totale 2650 kcal')
  })
})
