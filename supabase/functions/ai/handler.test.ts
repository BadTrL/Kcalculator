import { describe, expect, it } from 'vitest'
import { BadRequest, cleanAnalysis, cleanMenu, cleanProposal, parseRequest } from './handler'

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

describe('menu', () => {
  it('accepte une demande écrite sans image', () => {
    const r = parseRequest({ action: 'menu', prompt: 'bowl poulet riz', context: 'ctx', foods: '[1] Riz' })
    expect(r).toMatchObject({ action: 'menu', prompt: 'bowl poulet riz', foods: '[1] Riz' })
  })
  it('refuse une demande vide', () => {
    expect(() => parseRequest({ action: 'menu', prompt: '  ' })).toThrow(BadRequest)
  })
  it('écarte les numéros d’aliment inconnus et les quantités nulles', () => {
    const m = cleanMenu(
      {
        name: 'Bowl',
        portions: 0,
        comment: 'ok',
        items: [
          { name: 'Riz', ref: 2, qty: 80, unit: 'g', kcal: 280, protein: 6, carbs: 62, fat: 1 },
          { name: 'Poulet', ref: 9, qty: 150, unit: 'kg', kcal: 165, protein: 34, carbs: 0, fat: 3 },
          { name: 'Sel', ref: 0, qty: 0, unit: 'g', kcal: 0, protein: 0, carbs: 0, fat: 0 },
        ],
      },
      3,
    )
    expect(m.portions).toBe(1)
    expect(m.items).toHaveLength(2)
    expect(m.items[0].ref).toBe(2)
    expect(m.items[1]).toMatchObject({ ref: 0, unit: 'g' })
  })
})

describe('cleanProposal', () => {
  const items = [{ name: 'Riz', ref: 1, qty: 80, unit: 'g', kcal: 280, protein: 6, carbs: 62, fat: 1 }]
  it('garde un repas pour le journal avec sa date et son numéro', () => {
    const p = cleanProposal('proposer_repas_journal', { date: '2026-11-18', meal: 2, name: 'Midi', items, comment: '' }, 1, '2026-11-17')
    expect(p).toMatchObject({ kind: 'journal', date: '2026-11-18', meal: 2, name: 'Midi' })
    expect(p?.items[0].ref).toBe(1)
  })
  it('remplace une date invalide par celle du jour', () => {
    expect(cleanProposal('proposer_repas_journal', { date: 'demain', meal: 0, name: 'x', items }, 1, '2026-11-17')).toMatchObject({ date: '2026-11-17', meal: 1 })
    expect(cleanProposal('proposer_repas_journal', { date: '2026-11-15', meal: 3, time: '19h', name: 'x', items }, 1, '2026-11-17')).toMatchObject({ time: '19:00' })
    expect(cleanProposal('proposer_repas_journal', { date: '2026-11-15', meal: 3, time: '', name: 'x', items }, 1, '2026-11-17')?.time).toBeUndefined()
  })
  it('garde un menu et refuse un outil inconnu ou vide', () => {
    expect(cleanProposal('proposer_menu', { name: 'Bowl', portions: 3, items, comment: '' }, 1, '2026-11-17')).toMatchObject({ kind: 'menu', portions: 3 })
    expect(cleanProposal('effacer_tout', { items }, 1, '2026-11-17')).toBeNull()
    expect(cleanProposal('proposer_menu', { name: 'Vide', items: [] }, 1, '2026-11-17')).toBeNull()
  })
})
