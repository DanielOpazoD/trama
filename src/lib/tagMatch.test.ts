import { describe, it, expect } from 'vitest'
import { findActiveTag, matchTags, applyTag } from './tagMatch'

describe('findActiveTag', () => {
  it('detecta una etiqueta recién iniciada con el caret al final', () => {
    const text = 'una idea sobre #mem'
    const token = findActiveTag(text, text.length)
    expect(token).toEqual({ query: 'mem', start: 15, end: 19 })
  })

  it('detecta el `#` solo (query vacía) listo para sugerir todo', () => {
    const text = 'nota #'
    const token = findActiveTag(text, text.length)
    expect(token).toEqual({ query: '', start: 5, end: 6 })
  })

  it('matchea al inicio del texto', () => {
    const token = findActiveTag('#tag', 4)
    expect(token).toEqual({ query: 'tag', start: 0, end: 4 })
  })

  it('NO matchea un `#` en medio de una palabra (p. ej. fragmento de URL)', () => {
    const text = 'http://x.com/a#frag'
    expect(findActiveTag(text, text.length)).toBeNull()
  })

  it('NO matchea cuando el caret está tras un espacio (token cerrado)', () => {
    const text = '#hecho '
    expect(findActiveTag(text, text.length)).toBeNull()
  })

  it('NO matchea cuando no hay `#`', () => {
    expect(findActiveTag('solo texto', 10)).toBeNull()
  })

  it('tolera acentos y ñ en el token', () => {
    const text = '#diseño'
    const token = findActiveTag(text, text.length)
    expect(token?.query).toBe('diseño')
  })
})

describe('matchTags', () => {
  const universe = ['memoria', 'memorable', 'arte', 'arquitectura', 'diseño']

  it('prioriza prefijo sobre contiene, alfabético dentro de cada grupo', () => {
    expect(matchTags(universe, 'me')).toEqual(['memorable', 'memoria'])
  })

  it('incluye matches por substring después de los de prefijo', () => {
    // "ar" es prefijo de arte/arquitectura; "colmar" lo contiene pero no empieza.
    expect(matchTags(['arte', 'arquitectura', 'colmar'], 'ar')).toEqual([
      'arquitectura',
      'arte',
      'colmar',
    ])
  })

  it('con query vacía devuelve todo el universo ordenado', () => {
    expect(matchTags(['zeta', 'alfa'], '')).toEqual(['alfa', 'zeta'])
  })

  it('es tolerante a acentos y mayúsculas', () => {
    expect(matchTags(['diseño'], 'DIS')).toEqual(['diseño'])
    expect(matchTags(['diseño'], 'dise')).toEqual(['diseño'])
  })

  it('excluye un match exacto (ya escrito completo)', () => {
    expect(matchTags(['arte', 'arteria'], 'arte')).toEqual(['arteria'])
  })

  it('respeta el límite', () => {
    expect(matchTags(['a1', 'a2', 'a3', 'a4'], 'a', 2)).toEqual(['a1', 'a2'])
  })

  it('deduplica el universo', () => {
    expect(matchTags(['arte', 'arte', 'arquitectura'], 'arq')).toEqual(['arquitectura'])
  })
})

describe('applyTag', () => {
  it('reemplaza el token por `#tag ` y deja el caret tras el espacio', () => {
    const text = 'idea #mem'
    const token = findActiveTag(text, text.length)!
    const { value, caret } = applyTag(text, token, 'memoria')
    expect(value).toBe('idea #memoria ')
    expect(caret).toBe(value.length)
  })

  it('conserva el texto posterior al caret', () => {
    const text = 'inicio #me final'
    // caret tras "me" (índice 10).
    const token = findActiveTag(text, 10)!
    const { value, caret } = applyTag(text, token, 'memoria')
    expect(value).toBe('inicio #memoria  final')
    expect(value.slice(caret)).toBe(' final')
  })
})
