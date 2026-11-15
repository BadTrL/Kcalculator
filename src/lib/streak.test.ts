import { describe, expect, it } from 'vitest'
import { addDays, cheatImpact, computeConsistency, computeStreak, dayScore, kcalAdherence, mondayOf } from './streak'
import type { Macros } from './types'

const T: Macros = { kcal: 2000, protein: 150, carbs: 200, fat: 70 }
const day = (kcal: number, protein = 150): Macros => ({ kcal, protein, carbs: 0, fat: 0 })
const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i))

describe('streak', () => {
  it('compte les jours de suite et garde la série tant que la journée est en cours', () => {
    const s = computeStreak(new Set(range('2026-11-10', 5)), '2026-11-15') // 10 → 14, aujourd'hui vide
    expect(s.current).toBe(5)
    expect(s.atRisk).toBe(true)
    expect(s.todayDone).toBe(false)
    const s2 = computeStreak(new Set(range('2026-11-10', 6)), '2026-11-15')
    expect(s2.current).toBe(6)
    expect(s2.atRisk).toBe(false)
  })

  it('casse la série après un jour oublié sans gel', () => {
    const s = computeStreak(new Set(['2026-11-10', '2026-11-11', '2026-11-13', '2026-11-14']), '2026-11-15')
    expect(s.current).toBe(2)
    expect(s.best).toBe(2)
    expect(s.marks['2026-11-12']).toBe('missed')
  })

  it('utilise un gel gagné après 7 jours', () => {
    const days = new Set([...range('2026-11-01', 7), ...range('2026-11-09', 3)]) // le 8 est oublié
    const s = computeStreak(days, '2026-11-11')
    expect(s.marks['2026-11-08']).toBe('frozen')
    expect(s.current).toBe(10)
    expect(s.freezes).toBe(0)
  })

  it('ne garde pas plus de 2 gels', () => {
    expect(computeStreak(new Set(range('2026-10-01', 30)), '2026-10-30').freezes).toBe(2)
  })

  it('vide si rien', () => {
    expect(computeStreak(new Set(), '2026-11-15').current).toBe(0)
  })
})

describe('score de constance', () => {
  it('note les calories avec une tolérance de 10 %', () => {
    expect(kcalAdherence(2150, 2000)).toBe(1)
    expect(kcalAdherence(2700, 2000)).toBe(0)
    expect(kcalAdherence(2450, 2000)).toBeCloseTo(0.5)
  })

  it('tolère le premier cheat meal de la semaine seulement', () => {
    const totals = { '2026-11-10': day(3000), '2026-11-12': day(3000) } // mardi et jeudi
    const cheats = new Set(['2026-11-10', '2026-11-12'])
    const a = dayScore('2026-11-10', totals, T, cheats)
    const b = dayScore('2026-11-12', totals, T, cheats)
    expect(a.tolerated).toBe(true)
    expect(a.score).toBeCloseTo(0.7 * 0.5 + 0.3)
    expect(b.tolerated).toBe(false)
    expect(b.score).toBeCloseTo(0.3)
  })

  it('ne pénalise pas avant le premier jour du journal et ignore aujourd’hui tant qu’il est vide', () => {
    const totals: Record<string, Macros> = {}
    for (const d of range('2026-11-12', 3)) totals[d] = day(2000) // 12, 13, 14
    const c = computeConsistency(totals, T, new Set(), '2026-11-15')
    expect(c.days).toHaveLength(3)
    expect(c.score).toBe(100)
    totals['2026-11-11'] = day(500) // en dessous de la moitié : compte comme non rempli
    expect(computeConsistency(totals, T, new Set(), '2026-11-15').days).toHaveLength(3)
  })

  it('un jour oublié vaut 0', () => {
    const totals = { '2026-11-13': day(2000), '2026-11-15': day(2000) }
    const c = computeConsistency(totals, T, new Set(), '2026-11-15')
    expect(c.score).toBe(67)
  })
})

describe('impact des cheat meals', () => {
  it('calcule l’excès, le déficit mangé et le rattrapage plafonné', () => {
    expect(mondayOf('2026-11-15')).toBe('2026-11-09') // dimanche → lundi
    const totals = { '2026-11-10': day(2000), '2026-11-11': day(3540) }
    const w = cheatImpact('2026-11-11', totals, 2000, 2500, 'seche', new Set(['2026-11-11']), '2026-11-11')
    expect(w.excess).toBe(1540)
    expect(w.fatGrams).toBeCloseTo(200)
    expect(w.deficitEaten).toBeCloseTo(1540 / 3500)
    expect(w.daysLost).toBeCloseTo(3.08)
    expect(w.remaining).toBe(4) // jeudi → dimanche
    expect(w.compensate).toBeCloseTo(300) // 1540 / 4 = 385, plafonné à 15 % de 2000
  })

  it('pas de déficit hors sèche', () => {
    const w = cheatImpact('2026-11-11', { '2026-11-11': day(2600) }, 2000, 2000, 'maintien', new Set(['2026-11-11']), '2026-11-15')
    expect(w.deficitEaten).toBeNull()
    expect(w.compensate).toBe(0)
  })
})
