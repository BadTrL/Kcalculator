import { describe, expect, it } from 'vitest'
import { per100, rescale } from './ai'

const pates = { name: 'Pâtes', grams: 250, kcal: 400, protein: 14, carbs: 78, fat: 3 }

describe('per100', () => {
  it('ramène une portion à 100 g', () => {
    expect(per100(pates)).toEqual({ kcal: 160, protein: 5.6, carbs: 31.2, fat: 1.2 })
  })
  it('ne divise pas par zéro', () => {
    expect(per100({ ...pates, grams: 0 }).kcal).toBe(0)
  })
})

describe('rescale', () => {
  it('fait suivre les macros quand le poids change', () => {
    expect(rescale(pates, 125)).toEqual({ name: 'Pâtes', grams: 125, kcal: 200, protein: 7, carbs: 39, fat: 1.5 })
  })
})
