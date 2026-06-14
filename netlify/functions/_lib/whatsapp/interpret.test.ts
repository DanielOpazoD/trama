import { describe, expect, it } from 'vitest'
import { buildClassifyPrompt, validateClassification } from './interpret'

describe('buildClassifyPrompt', () => {
  it('arma system + user con el texto', () => {
    const msgs = buildClassifyPrompt('hola mundo')
    expect(msgs).toHaveLength(2)
    expect(msgs[0]!.role).toBe('system')
    expect(msgs[1]).toEqual({ role: 'user', content: 'hola mundo' })
  })
})

describe('validateClassification', () => {
  it('note', () => {
    expect(validateClassification({ kind: 'note', note: { content: 'algo' } })).toEqual({
      kind: 'note',
      content: 'algo',
    })
  })

  it('quote con autor', () => {
    expect(
      validateClassification({
        kind: 'quote',
        quote: { text: 'frase', author: 'Borges' },
      }),
    ).toEqual({ kind: 'quote', text: 'frase', author: 'Borges' })
  })

  it('entity con tipo default si falta', () => {
    expect(validateClassification({ kind: 'entity', entity: { name: 'Kant' } })).toEqual({
      kind: 'entity',
      name: 'Kant',
      entityType: 'concepto',
      description: null,
    })
  })

  it('entity normaliza el tipo a slug (igual que el parser de prefijos)', () => {
    expect(
      validateClassification({
        kind: 'entity',
        entity: { name: 'Kant', type: 'Persona Pública' },
      }),
    ).toEqual({
      kind: 'entity',
      name: 'Kant',
      entityType: 'persona_publica',
      description: null,
    })
  })

  it('momento', () => {
    expect(
      validateClassification({
        kind: 'momento',
        momento: { bodyText: 'hoy fui al mar' },
      }),
    ).toEqual({ kind: 'momento', bodyText: 'hoy fui al mar' })
  })

  it('null cuando falta el campo requerido', () => {
    expect(validateClassification({ kind: 'note', note: {} })).toBeNull()
    expect(validateClassification({ kind: 'quote', quote: { author: 'x' } })).toBeNull()
    expect(validateClassification({ kind: 'entity', entity: {} })).toBeNull()
  })

  it('null para entrada basura', () => {
    expect(validateClassification(null)).toBeNull()
    expect(validateClassification('texto')).toBeNull()
    expect(validateClassification({ kind: 'otro' })).toBeNull()
  })
})
