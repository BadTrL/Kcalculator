import { describe, expect, it } from 'vitest'
import { guessMeal, mealsOfDay, normalizeCheatKeys, normalizeTime, toMeal } from './meals'
import { normalizeEntries } from './store'
import type { Entry } from './types'

describe('repas numérotés', () => {
  it('convertit les anciens créneaux nommés dans le même ordre', () => {
    expect(['Matin', 'Midi', 'Collation', 'Soir'].map(toMeal)).toEqual([1, 2, 3, 4])
    expect(toMeal(3)).toBe(3)
    expect(toMeal('5')).toBe(5)
    expect(toMeal('???')).toBe(1)
  })

  it('convertit les clés de cheat meals', () => {
    expect(normalizeCheatKeys(['2026-11-17|Soir', '2026-11-10|Midi', '2026-11-17|4'])).toEqual(['2026-11-10|2', '2026-11-17|4'])
    expect(normalizeCheatKeys(undefined)).toBeUndefined()
  })

  it('migre les lignes du journal sans toucher à updated_at', () => {
    const old = { a: { id: 'a', date: '2026-11-17', meal: 'Collation', food_id: 'x', qty: 1, updated_at: 'T' } } as unknown as Record<string, Entry>
    const out = normalizeEntries(old)
    expect(out.a.meal).toBe(3)
    expect(out.a.updated_at).toBe('T')
    // Déjà à jour : même objet, pas de réécriture inutile.
    expect(normalizeEntries(out)).toBe(out)
  })

  it('affiche au moins le nombre de repas du profil, plus ceux utilisés', () => {
    expect(mealsOfDay(undefined, [])).toEqual([1, 2, 3, 4])
    expect(mealsOfDay(3, [])).toEqual([1, 2, 3])
    expect(mealsOfDay(3, [2, 6])).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("normalise l'heure", () => {
    expect(normalizeTime('7:5')).toBe('07:05')
    expect(normalizeTime('12:30')).toBe('12:30')
    expect(normalizeTime('')).toBeNull()
    expect(normalizeTime('25:00')).toBeNull()
    expect(normalizeTime(null)).toBeNull()
  })

  it("devine le repas selon l'heure", () => {
    expect(guessMeal(4, 7)).toBe(1)
    expect(guessMeal(4, 13)).toBe(2)
    expect(guessMeal(4, 23)).toBe(4)
  })
})
