import { describe, expect, it } from 'vitest'
import { initials } from './initials'

describe('initials', () => {
  it("prend le nom du profil s'il existe", () => {
    expect(initials({ email: 'x@y.fr', user_metadata: { full_name: 'Jean Dupont' } })).toBe('JD')
  })
  it("sinon le début de l'e-mail", () => {
    expect(initials({ email: 'jean.dupont@exemple.fr' })).toBe('JD')
    expect(initials({ email: 'sacha@exemple.fr' })).toBe('SA')
  })
  it('renvoie ? sans rien', () => {
    expect(initials({ email: null })).toBe('?')
  })
})
