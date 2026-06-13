import { describe, expect, it } from 'vitest'
import { parseInboundMessage } from './parse-command'

describe('parseInboundMessage — comandos de control', () => {
  it('reconoce vincular con código', () => {
    const r = parseInboundMessage('vincular ABC123')
    expect(r).toEqual({ kind: 'link', rawCode: 'ABC123' })
  })

  it('reconoce link en inglés', () => {
    expect(parseInboundMessage('link xyz789')).toEqual({
      kind: 'link',
      rawCode: 'xyz789',
    })
  })

  it('ayuda / help / ?', () => {
    expect(parseInboundMessage('ayuda').kind).toBe('help')
    expect(parseInboundMessage('HELP').kind).toBe('help')
    expect(parseInboundMessage('?').kind).toBe('help')
  })

  it('mensaje vacío', () => {
    expect(parseInboundMessage('   ').kind).toBe('empty')
  })
})

describe('parseInboundMessage — prefijos explícitos', () => {
  it('nota:', () => {
    expect(parseInboundMessage('nota: comprar pan')).toEqual({
      kind: 'intent',
      intent: { kind: 'note', content: 'comprar pan' },
    })
  })

  it('acepta tildes y mayúsculas en la palabra clave', () => {
    expect(parseInboundMessage('Nota: algo')).toMatchObject({
      intent: { kind: 'note' },
    })
  })

  it('momento:', () => {
    expect(parseInboundMessage('momento: hoy llovió toda la tarde')).toEqual({
      kind: 'intent',
      intent: { kind: 'momento', bodyText: 'hoy llovió toda la tarde' },
    })
  })

  it('cita con autor separado por em-dash', () => {
    expect(parseInboundMessage('cita: el tiempo es relativo — Einstein')).toEqual({
      kind: 'intent',
      intent: { kind: 'quote', text: 'el tiempo es relativo', author: 'Einstein' },
    })
  })

  it('cita sin autor deja author vacío', () => {
    expect(parseInboundMessage('cita: una frase suelta')).toEqual({
      kind: 'intent',
      intent: { kind: 'quote', text: 'una frase suelta', author: '' },
    })
  })

  it('entidad con tipo entre paréntesis', () => {
    expect(parseInboundMessage('entidad: Rayuela (libro)')).toEqual({
      kind: 'intent',
      intent: { kind: 'entity', name: 'Rayuela', entityType: 'libro', description: null },
    })
  })

  it('entidad sin tipo cae a concepto', () => {
    expect(parseInboundMessage('entidad: la entropía')).toEqual({
      kind: 'intent',
      intent: {
        kind: 'entity',
        name: 'la entropía',
        entityType: 'concepto',
        description: null,
      },
    })
  })

  it('forma con barra: /nota texto', () => {
    expect(parseInboundMessage('/nota recordar esto')).toMatchObject({
      intent: { kind: 'note', content: 'recordar esto' },
    })
  })
})

describe('parseInboundMessage — texto libre', () => {
  it('sin prefijo conocido cae a freeform con el texto entero', () => {
    expect(parseInboundMessage('me acordé de algo importante')).toEqual({
      kind: 'freeform',
      text: 'me acordé de algo importante',
    })
  })

  it('una palabra clave no reconocida no se trata como prefijo', () => {
    expect(parseInboundMessage('idea: tal vez esto')).toEqual({
      kind: 'freeform',
      text: 'idea: tal vez esto',
    })
  })
})
