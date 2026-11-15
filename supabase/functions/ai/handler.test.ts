import { describe, expect, it } from 'vitest'
import { BadRequest, cleanAnalysis, parseRequest } from './handler'

describe('parseRequest', () => {
  it('accepte une analyse de photo', () => {
    const r = parseRequest({ action: 'analyze', image: 'abc', mediaType: 'image/jpeg', note: 'sauce à part' })
    expect(r).toMatchObject({ action: 'analyze', image: 'abc', note: 'sauce à part' })
  })
  it('refuse un format inconnu ou une action inconnue', () => {
    expect(() => parseRequest({ action: 'analyze', image: 'abc', mediaType: 'image/tiff' })).toThrow(BadRequest)
    expect(() => parseRequest({ action: 'pirate' })).toThrow(BadRequest)
  })
  it('remet la conversation du coach en ordre', () => {
    const r = parseRequest({
      action: 'coach',
      context: 'ctx',
      messages: [
        { role: 'assistant', content: 'Salut' },
        { role: 'user', content: 'Mon cheat meal ?' },
      ],
    })
    expect(r).toEqual({ action: 'coach', context: 'ctx', messages: [{ role: 'user', content: 'Mon cheat meal ?' }] })
  })
  it('exige que le dernier message vienne de la personne', () => {
    expect(() => parseRequest({ action: 'coach', context: '', messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] })).toThrow(BadRequest)
  })
})

describe('cleanAnalysis', () => {
  it('écarte les éléments vides et les valeurs négatives', () => {
    const a = cleanAnalysis({
      dish: 'Poulet riz',
      confidence: 'haute',
      comment: 'ok',
      items: [
        { name: 'Riz', grams: 180.04, kcal: 230, protein: 4.9, carbs: 50, fat: -1 },
        { name: '', grams: 50, kcal: 1, protein: 0, carbs: 0, fat: 0 },
        { name: 'Sauce', grams: 0, kcal: 80, protein: 0, carbs: 0, fat: 9 },
      ],
    })
    expect(a.items).toEqual([{ name: 'Riz', grams: 180, kcal: 230, protein: 4.9, carbs: 50, fat: 0 }])
    expect(a.confidence).toBe('faible')
  })
})
