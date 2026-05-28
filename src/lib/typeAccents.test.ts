import { describe, expect, it } from 'vitest'
import { typeAccent } from './typeAccents'

/**
 * Tests para typeAccent — verifica:
 *  - El patrón nativo `var(--type-<slug>, var(--type-default))` funciona.
 *  - Slugs nuevos no requieren modificar el código (regla CLAUDE.md).
 *  - Defense-in-depth contra slugs maliciosos.
 */

describe('typeAccent', () => {
  it('devuelve la CSS variable con fallback al default', () => {
    expect(typeAccent('persona')).toBe('var(--type-persona, var(--type-default))')
    expect(typeAccent('libro')).toBe('var(--type-libro, var(--type-default))')
  })

  it('acepta slugs nuevos sin cambiar código (CLAUDE.md rule)', () => {
    // Si un user agrega un tipo "podcast-en-vivo" desde Admin, el accent
    // debería seguir generándose como var() — el browser caerá al
    // default si la CSS variable no existe.
    expect(typeAccent('podcast-en-vivo')).toBe(
      'var(--type-podcast-en-vivo, var(--type-default))',
    )
    expect(typeAccent('tipo_con_underscore')).toBe(
      'var(--type-tipo_con_underscore, var(--type-default))',
    )
  })

  it('si el slug queda vacío tras sanear, devuelve el default directo', () => {
    expect(typeAccent('')).toBe('var(--type-default)')
    expect(typeAccent('!!!')).toBe('var(--type-default)')
    expect(typeAccent('   ')).toBe('var(--type-default)')
  })

  it('sanea chars que romperían el CSS (defense-in-depth)', () => {
    // Intento de "CSS injection" a través del nombre del tipo. Los
    // chars no slug-safe (paréntesis, punto y coma, dos puntos,
    // espacios) se filtran. Las letras quedan literal pero NO son
    // peligrosas DENTRO del nombre de una CSS variable — la sintaxis
    // las trata como parte del identificador, inertes.
    const result = typeAccent('x); foo:expression(0)')
    expect(result).not.toContain(';')
    expect(result).not.toContain('(0)')
    expect(result).not.toContain(':')
    // Y mantiene la forma de CSS variable válida con fallback.
    expect(result).toMatch(/^var\(--type-[a-z0-9_-]+, var\(--type-default\)\)$/i)
  })

  it('preserva case (lower y upper) tras sanear', () => {
    // Las CSS variables son case-sensitive; preservamos el original
    // y dejamos que la convención en index.css (lowercase) sea la
    // que rule.
    expect(typeAccent('Persona')).toBe('var(--type-Persona, var(--type-default))')
  })
})
