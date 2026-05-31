import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { momentoEmbedText, validatePayloadForKind } from './momento-embed'

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
    expect(momentoEmbedText('foto', { caption: 'atardecer en la playa' }, null)).toBe(
      'atardecer en la playa',
    )
    expect(momentoEmbedText('foto', { caption: 'playa' }, 'con Lola')).toBe(
      'con Lola\nplaya',
    )
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
    const text = momentoEmbedText('nota', { bodyText: 42 as unknown as string }, null)
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

describe('validatePayloadForKind', () => {
  describe('kind=nota', () => {
    it('acepta payload con bodyText no vacío', () => {
      expect(validatePayloadForKind('nota', { bodyText: 'hola' })).toBeNull()
    })
    it('rechaza bodyText vacío o ausente', () => {
      expect(validatePayloadForKind('nota', {})).toMatch(/bodyText/)
      expect(validatePayloadForKind('nota', { bodyText: '' })).toMatch(/bodyText/)
      expect(validatePayloadForKind('nota', { bodyText: '   ' })).toMatch(/bodyText/)
    })
  })

  describe('kind=recorte', () => {
    it('acepta cuando hay url, title o bodyText (al menos uno)', () => {
      expect(validatePayloadForKind('recorte', { url: 'https://x.com' })).toBeNull()
      expect(validatePayloadForKind('recorte', { title: 'X' })).toBeNull()
      expect(validatePayloadForKind('recorte', { bodyText: 'algo' })).toBeNull()
      expect(
        validatePayloadForKind('recorte', { url: 'x', title: 'y', bodyText: 'z' }),
      ).toBeNull()
    })
    it('rechaza recorte sin ningún campo textual', () => {
      expect(validatePayloadForKind('recorte', {})).toMatch(/url, title o bodyText/)
      expect(
        validatePayloadForKind('recorte', { source: 'Twitter', author: '@x' }),
      ).toMatch(/url, title o bodyText/)
    })
    it('rechaza campos con solo espacios', () => {
      expect(
        validatePayloadForKind('recorte', { url: '   ', title: '', bodyText: '' }),
      ).toMatch(/url, title o bodyText/)
    })
  })

  describe('kind=foto', () => {
    it('acepta cuando storageKey existe y es string no vacía', () => {
      expect(validatePayloadForKind('foto', { storageKey: 'abc123.jpg' })).toBeNull()
    })
    it('rechaza foto sin storageKey', () => {
      expect(validatePayloadForKind('foto', {})).toMatch(/storageKey/)
      expect(validatePayloadForKind('foto', { caption: 'algo', width: 100 })).toMatch(
        /storageKey/,
      )
    })
    it('rechaza storageKey con valor no-string', () => {
      expect(validatePayloadForKind('foto', { storageKey: 42 as never })).toMatch(
        /storageKey/,
      )
    })
  })
})

describe('momento schema boundary', () => {
  it('mantiene el servidor como adaptador del schema compartido de Momentos', () => {
    const source = readFileSync(
      join(process.cwd(), 'netlify/functions/_lib/momento-schemas.ts'),
      'utf8',
    )

    expect(source).toContain('../../../src/schemas/momento.js')
    expect(source).not.toMatch(/export const Momento(?:Nota|Recorte|Foto)PayloadSchema/)
    expect(source).not.toMatch(/function validateMomentoPayload/)
  })
})
