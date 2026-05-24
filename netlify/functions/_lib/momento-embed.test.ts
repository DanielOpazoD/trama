import { describe, it, expect } from 'vitest'
import { momentoEmbedText } from './momento-embed'

describe('momentoEmbedText', () => {
  it('nota: usa solo bodyText (más note si lo hay)', () => {
    expect(momentoEmbedText('nota', { bodyText: 'algo' }, null)).toBe('algo')
    expect(momentoEmbedText('nota', { bodyText: 'algo' }, 'una nota')).toBe(
      'una nota\nalgo',
    )
  })

  it('recorte: concatena note + title + bodyText + author + source con etiquetas', () => {
    const text = momentoEmbedText(
      'recorte',
      {
        title: 'Anthropic launches Claude 4',
        bodyText: 'New model with reasoning…',
        author: '@anthropic',
        source: 'Anthropic blog',
      },
      'me interesa la parte de tools',
    )
    expect(text).toContain('me interesa la parte de tools')
    expect(text).toContain('Anthropic launches Claude 4')
    expect(text).toContain('New model with reasoning')
    expect(text).toContain('Autor: @anthropic')
    expect(text).toContain('Fuente: Anthropic blog')
  })

  it('recorte: campos vacíos se ignoran sin crashear', () => {
    const text = momentoEmbedText('recorte', { title: 'Solo título' }, null)
    expect(text).toBe('Solo título')
  })

  it('foto: usa solo caption (más note)', () => {
    expect(
      momentoEmbedText('foto', { caption: 'atardecer en la playa' }, null),
    ).toBe('atardecer en la playa')
    expect(
      momentoEmbedText('foto', { caption: 'playa' }, 'con Lola'),
    ).toBe('con Lola\nplaya')
  })

  it('foto: ignora storageKey/width/height/exifDate (no son texto)', () => {
    const text = momentoEmbedText(
      'foto',
      {
        storageKey: 'abc123',
        width: 1920,
        height: 1080,
        caption: 'paisaje',
        exifDate: '2026-05-24T00:00:00Z',
      },
      null,
    )
    expect(text).toBe('paisaje')
    expect(text).not.toContain('abc123')
    expect(text).not.toContain('1920')
    expect(text).not.toContain('2026-05-24')
  })

  it('payload con campos no-string se ignoran (defensa contra JSONB raro)', () => {
    const text = momentoEmbedText(
      'nota',
      { bodyText: 42 as unknown as string },
      null,
    )
    expect(text).toBe('')
  })

  it('todo vacío → string vacía', () => {
    expect(momentoEmbedText('nota', {}, null)).toBe('')
    expect(momentoEmbedText('recorte', {}, null)).toBe('')
    expect(momentoEmbedText('foto', {}, null)).toBe('')
  })

  it('trim final: no devuelve espacios al borde', () => {
    expect(momentoEmbedText('nota', { bodyText: '   con espacios   ' }, null)).toBe(
      'con espacios',
    )
  })

  it('note solo (sin payload) funciona para los tres kinds', () => {
    expect(momentoEmbedText('nota', {}, 'solo nota')).toBe('solo nota')
    expect(momentoEmbedText('recorte', {}, 'solo nota')).toBe('solo nota')
    expect(momentoEmbedText('foto', {}, 'solo nota')).toBe('solo nota')
  })
})
