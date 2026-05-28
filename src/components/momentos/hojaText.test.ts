import { describe, it, expect } from 'vitest'
import { detectTrigger, replaceRange, formatQuote } from './hojaText'

/**
 * Tests de la detección de triggers del editor de Hojas. El cursor se
 * representa con la longitud del prefijo: `detectTrigger(text, caret)`.
 */
describe('detectTrigger', () => {
  it('detecta una mención @token al final del texto', () => {
    const text = 'leía a @borg'
    const t = detectTrigger(text, text.length)
    expect(t).toEqual({ kind: 'entity', query: 'borg', start: 7, end: text.length })
  })

  it('detecta @ vacío (recién tipeado)', () => {
    const text = 'leía a @'
    const t = detectTrigger(text, text.length)
    expect(t).toMatchObject({ kind: 'entity', query: '' })
  })

  it('un espacio después del @ termina la mención (no hay trigger)', () => {
    const text = 'leía a @borg ges'
    expect(detectTrigger(text, text.length)).toBeNull()
  })

  it('@ pegado a una palabra (email) no es mención', () => {
    const text = 'mail a juan@gmail'
    expect(detectTrigger(text, text.length)).toBeNull()
  })

  it('gana la mención más cercana al cursor', () => {
    const text = '@borges y @cortazar'
    const t = detectTrigger(text, text.length)
    expect(t).toMatchObject({ kind: 'entity', query: 'cortazar', start: 10 })
  })

  it('detecta una cita cuando > abre la línea, con query multi-palabra', () => {
    const text = '> el tiempo y la memoria'
    const t = detectTrigger(text, text.length)
    expect(t).toEqual({
      kind: 'quote',
      query: 'el tiempo y la memoria',
      start: 0,
      end: text.length,
    })
  })

  it('> con sangría sigue siendo cita (primer no-blanco de la línea)', () => {
    const text = 'nota previa\n  > espejos'
    const t = detectTrigger(text, text.length)
    expect(t).toMatchObject({ kind: 'quote', query: 'espejos' })
  })

  it('> a mitad de línea no es cita', () => {
    const text = 'dos > uno'
    expect(detectTrigger(text, text.length)).toBeNull()
  })

  it('prefiere la mención cuando se tipea @ dentro de una línea de cita', () => {
    const text = '> espejos @borg'
    const t = detectTrigger(text, text.length)
    expect(t).toMatchObject({ kind: 'entity', query: 'borg' })
  })

  it('sin trigger devuelve null', () => {
    expect(detectTrigger('prosa común', 5)).toBeNull()
  })
})

describe('replaceRange', () => {
  it('reemplaza el rango del trigger y reposiciona el cursor', () => {
    const text = 'leía a @borg'
    const r = replaceRange(text, 7, text.length, '@Borges ')
    expect(r.text).toBe('leía a @Borges ')
    expect(r.caret).toBe(r.text.length)
  })

  it('inserta en el medio sin pisar el resto', () => {
    const text = 'a @x final'
    const r = replaceRange(text, 2, 4, '@Equis ')
    expect(r.text).toBe('a @Equis  final')
    expect(r.caret).toBe(2 + '@Equis '.length)
  })
})

describe('formatQuote', () => {
  it('envuelve en comillas latinas con atribución', () => {
    expect(formatQuote('El olvido es venganza.', 'Borges')).toBe(
      '«El olvido es venganza.» — Borges',
    )
  })

  it('sin atribución, solo comillas', () => {
    expect(formatQuote('  texto suelto  ', null)).toBe('«texto suelto»')
    expect(formatQuote('texto', '   ')).toBe('«texto»')
  })
})
