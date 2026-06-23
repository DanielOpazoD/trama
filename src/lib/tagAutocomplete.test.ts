import { describe, it, expect } from 'vitest'
import {
  findActiveTagToken,
  matchTags,
  completeTag,
  type TagEntry,
} from './tagAutocomplete'

/**
 * Lógica pura del autocompletado de `#etiquetas` del composer de Notas. El
 * módulo se separó de la UI justamente para testearse aislado; estos casos
 * fijan las tres decisiones: qué token hay bajo el caret, qué sugerencias
 * matchean (con su orden) y qué texto queda al completar.
 */

describe('findActiveTagToken', () => {
  // Helper: el caret va al final de `before` (lo ya escrito hasta el cursor).
  function at(before: string, after = ''): ReturnType<typeof findActiveTagToken> {
    return findActiveTagToken(before + after, before.length)
  }

  it('detecta un token recién abierto con `#` al inicio del texto', () => {
    expect(at('#')).toEqual({ query: '', start: 0, end: 1 })
  })

  it('detecta el token y su query tras un separador', () => {
    expect(at('hola #mem')).toEqual({ query: 'mem', start: 5, end: 9 })
  })

  it('acepta cuerpo de tag con acentos, ñ, dígitos, guion y guion bajo', () => {
    expect(at('#memória_2-bis')).toEqual({
      query: 'memória_2-bis',
      start: 0,
      end: 14,
    })
  })

  it('NO dispara si el `#` está pegado a una palabra (no es etiqueta)', () => {
    expect(at('foo#bar')).toBeNull()
  })

  it('vale tras un salto de línea (el `\\n` es separador)', () => {
    expect(at('línea\n#eti')).toEqual({ query: 'eti', start: 6, end: 10 })
  })

  it('devuelve null si el caret no viene de un `#` (texto suelto)', () => {
    expect(at('solo texto')).toBeNull()
  })

  it('devuelve null si entre el `#` y el caret hay un separador', () => {
    // El espacio cierra el token: lo que se tipea ahora ya no es la etiqueta.
    expect(at('#eti ya')).toBeNull()
  })

  it('mira solo hacia atrás: lo de adelante del caret no afecta', () => {
    const text = 'pre #me sufijo'
    // Caret justo tras "#me".
    expect(findActiveTagToken(text, 7)).toEqual({ query: 'me', start: 4, end: 7 })
  })
})

describe('matchTags', () => {
  const universe: TagEntry[] = [
    { tag: 'memoria', count: 10 },
    { tag: 'memorable', count: 3 },
    { tag: 'remember', count: 50 },
    { tag: 'memória', count: 1 },
    { tag: 'arte', count: 8 },
  ]

  it('sin query devuelve todo ordenado por frecuencia desc, luego alfabético', () => {
    const all = matchTags(universe, '', 10).map((e) => e.tag)
    expect(all).toEqual(['remember', 'memoria', 'arte', 'memorable', 'memória'])
  })

  it('prioriza prefijo sobre "contiene", y dentro de cada grupo por frecuencia', () => {
    const result = matchTags(universe, 'mem', 10).map((e) => e.tag)
    // Prefijo (rank 0): memoria(10), memorable(3), memória(1).
    // Contiene (rank 1): remember(50) va DESPUÉS pese a su frecuencia alta.
    expect(result).toEqual(['memoria', 'memorable', 'memória', 'remember'])
  })

  it('hace matching tolerante a acentos y mayúsculas', () => {
    expect(matchTags(universe, 'MEMÓ', 10).map((e) => e.tag)).toContain('memoria')
    expect(matchTags([{ tag: 'Memória', count: 1 }], 'memo', 10)).toHaveLength(1)
  })

  it('excluye el match exacto (incluido el equivalente tras folding) y conserva el resto', () => {
    const u: TagEntry[] = [
      { tag: 'arte', count: 5 },
      { tag: 'arté', count: 1 }, // folded === 'arte'
      { tag: 'artesanía', count: 2 },
    ]
    const result = matchTags(u, 'arte', 10).map((e) => e.tag)
    expect(result).not.toContain('arte') // exacto
    expect(result).not.toContain('arté') // exacto tras folding
    expect(result).toContain('artesanía') // prefijo: sobrevive
  })

  it('respeta el límite', () => {
    expect(matchTags(universe, '', 2)).toHaveLength(2)
  })

  it('desempata por orden alfabético cuando frecuencia y rank coinciden', () => {
    const tied: TagEntry[] = [
      { tag: 'beta', count: 5 },
      { tag: 'alfa', count: 5 },
    ]
    expect(matchTags(tied, '', 10).map((e) => e.tag)).toEqual(['alfa', 'beta'])
  })
})

describe('completeTag', () => {
  it('reemplaza el token por `#tag ` y deja el caret tras el espacio', () => {
    const text = 'hola #mem resto'
    const token = findActiveTagToken(text, 9)! // tras "#mem"
    const { value, caret } = completeTag(text, token, 'memoria')
    expect(value).toBe('hola #memoria  resto')
    expect(caret).toBe('hola #memoria '.length)
  })

  it('completa un token abierto al final sin texto a la derecha', () => {
    const text = 'nota #ar'
    const token = findActiveTagToken(text, text.length)!
    const { value, caret } = completeTag(text, token, 'arte')
    expect(value).toBe('nota #arte ')
    expect(caret).toBe(value.length)
  })
})
