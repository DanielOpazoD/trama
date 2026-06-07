import { describe, it, expect } from 'vitest'
import { matchModuleAlias } from './moduleAliases'

describe('matchModuleAlias', () => {
  it('exige el prefijo "#", case-insensitive y tolera espacios', () => {
    expect(matchModuleAlias('#pass')?.moduleId).toBe('claves')
    expect(matchModuleAlias('#CLAVES')?.moduleId).toBe('claves')
    expect(matchModuleAlias('  #pass ')?.moduleId).toBe('claves')
    expect(matchModuleAlias('#planillas')?.moduleId).toBe('planillas')
    expect(matchModuleAlias('#plantillas')?.moduleId).toBe('planillas')
  })

  it('sin "#" no matchea (evita falsos positivos al buscar contenido)', () => {
    expect(matchModuleAlias('pass')).toBeNull()
    expect(matchModuleAlias('claves')).toBeNull()
  })

  it('token desconocido, vacío o solo "#" devuelve null', () => {
    expect(matchModuleAlias('#xyz')).toBeNull()
    expect(matchModuleAlias('')).toBeNull()
    expect(matchModuleAlias('#')).toBeNull()
  })
})
