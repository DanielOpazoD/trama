import { describe, expect, it } from 'vitest'
import { parseWhatsAppMediaDirectives } from './media-directives'

describe('parseWhatsAppMediaDirectives', () => {
  it('extrae fecha numérica chilena y conserva la directiva de destino', () => {
    expect(parseWhatsAppMediaDirectives('A momentos. Fecha: 4-07-2026')).toEqual({
      body: 'A momentos',
      explicitCapturedAt: '2026-07-04T12:00:00.000',
      dateLabel: '4 jul 2026',
      grouping: 'auto',
    })
  })

  it('acepta fecha textual con mes en español', () => {
    expect(
      parseWhatsAppMediaDirectives('momento: cumple de la abuela. Fecha: 4 julio 2021'),
    ).toMatchObject({
      body: 'momento: cumple de la abuela',
      explicitCapturedAt: '2021-07-04T12:00:00.000',
      dateLabel: '4 jul 2021',
    })
    expect(
      parseWhatsAppMediaDirectives('momento: viaje. fecha 4 de julio de 2021'),
    ).toMatchObject({
      body: 'momento: viaje',
      explicitCapturedAt: '2021-07-04T12:00:00.000',
    })
  })

  it('acepta ISO date sin reinterpretar el orden', () => {
    expect(parseWhatsAppMediaDirectives('A momentos. Fecha: 2026-07-04')).toMatchObject({
      body: 'A momentos',
      explicitCapturedAt: '2026-07-04T12:00:00.000',
    })
  })

  it('detecta comandos simples para controlar agrupación', () => {
    expect(parseWhatsAppMediaDirectives('A momentos. Nuevo')).toMatchObject({
      body: 'A momentos',
      grouping: 'new',
    })
    expect(parseWhatsAppMediaDirectives('A momentos. No juntar')).toMatchObject({
      body: 'A momentos',
      grouping: 'new',
    })
    expect(parseWhatsAppMediaDirectives('A momentos. Agregar al anterior')).toMatchObject(
      {
        body: 'A momentos',
        grouping: 'append',
      },
    )
  })

  it('deja intacta una fecha inválida para no inventar metadata', () => {
    expect(parseWhatsAppMediaDirectives('A momentos. Fecha: 32-13-2026')).toEqual({
      body: 'A momentos. Fecha: 32-13-2026',
      explicitCapturedAt: null,
      dateLabel: null,
      grouping: 'auto',
    })
  })
})
