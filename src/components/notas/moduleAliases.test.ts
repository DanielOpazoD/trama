import { describe, it, expect } from 'vitest'
import { matchModuleAlias } from './moduleAliases'

describe('matchModuleAlias', () => {
  it('matchea con o sin "#", case-insensitive y con espacios', () => {
    expect(matchModuleAlias('#pass')?.moduleId).toBe('claves')
    expect(matchModuleAlias('pass')?.moduleId).toBe('claves')
    expect(matchModuleAlias('#PASS')?.moduleId).toBe('claves')
    expect(matchModuleAlias('  Claves ')?.moduleId).toBe('claves')
  })

  it('token desconocido o vacío devuelve null', () => {
    expect(matchModuleAlias('xyz')).toBeNull()
    expect(matchModuleAlias('')).toBeNull()
    expect(matchModuleAlias('#')).toBeNull()
  })
})
