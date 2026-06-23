import { describe, expect, it } from 'vitest'
import {
  buildDuplicateSuggestions,
  buildEntityCreateDraft,
  buildEntityEmbeddingSource,
  clampEntityLimit,
  parseEntityCursor,
  patchTouchesEmbeddingInput,
  shouldReembedEntity,
} from './entities-service.js'

describe('entities-service', () => {
  describe('buildEntityCreateDraft', () => {
    it('normaliza origin, colapsa ausentes a null y arma el texto de embedding', () => {
      const draft = buildEntityCreateDraft({
        type: 'persona',
        name: 'Borges',
        year: 1899,
        description: 'escritor argentino',
        origin: { kind: 'ai', provider: 'openai' },
      })

      expect(draft).toEqual({
        type: 'persona',
        name: 'Borges',
        year: 1899,
        description: 'escritor argentino',
        essay: null,
        positionX: null,
        positionY: null,
        origin: { kind: 'ai', provider: 'openai' },
        spotifyUrl: null,
        wikipediaUrl: null,
        grokipediaUrl: null,
        embedSource: 'Borges. tipo: persona. año: 1899. descripción: escritor argentino',
      })
    })

    it('preserva el shape de origin para string legacy y para ausente', () => {
      expect(
        buildEntityCreateDraft({ type: 't', name: 'A', origin: 'ai' }).origin,
      ).toEqual({
        kind: 'ai',
      })
      // Sin origin -> default manual (no string, objeto canónico).
      expect(buildEntityCreateDraft({ type: 't', name: 'A' }).origin).toEqual({
        kind: 'manual',
      })
    })

    it('mantiene null vs ausente como null en los campos opcionales', () => {
      const draft = buildEntityCreateDraft({
        type: 'obra',
        name: 'Ficciones',
        year: null,
        description: null,
        position_x: 12,
        position_y: 34,
        spotify_url: 'https://open.spotify.com/x',
      })
      expect(draft.year).toBeNull()
      expect(draft.description).toBeNull()
      expect(draft.positionX).toBe(12)
      expect(draft.positionY).toBe(34)
      expect(draft.spotifyUrl).toBe('https://open.spotify.com/x')
      // year/description ausentes del texto cuando son null.
      expect(draft.embedSource).toBe('Ficciones. tipo: obra')
    })
  })

  describe('buildEntityEmbeddingSource', () => {
    it('omite año y descripción cuando faltan', () => {
      expect(
        buildEntityEmbeddingSource({
          name: 'X',
          type: 'persona',
          year: null,
          description: null,
        }),
      ).toBe('X. tipo: persona')
    })
  })

  describe('patchTouchesEmbeddingInput', () => {
    it('detecta si el patch tocó algún campo de embedding', () => {
      expect(patchTouchesEmbeddingInput({ name: 'Nuevo' })).toBe(true)
      expect(patchTouchesEmbeddingInput({ year: 2000 })).toBe(true)
      // essay / posición / urls NO alimentan el embedding.
      expect(patchTouchesEmbeddingInput({ essay: 'algo', position_x: 1 })).toBe(false)
      expect(patchTouchesEmbeddingInput({})).toBe(false)
    })
  })

  describe('shouldReembedEntity', () => {
    const current = {
      name: 'Borges',
      type: 'persona',
      year: 1899,
      description: 'escritor',
    }

    it('re-embebe cuando un campo de embedding cambia de valor', () => {
      expect(shouldReembedEntity({ patch: { description: 'ensayista' }, current })).toBe(
        true,
      )
      expect(shouldReembedEntity({ patch: { name: 'J. L. Borges' }, current })).toBe(true)
      expect(shouldReembedEntity({ patch: { year: 1900 }, current })).toBe(true)
    })

    it('NO re-embebe cuando el patch manda el mismo valor', () => {
      expect(shouldReembedEntity({ patch: { description: 'escritor' }, current })).toBe(
        false,
      )
      expect(
        shouldReembedEntity({ patch: { name: 'Borges', type: 'persona' }, current }),
      ).toBe(false)
    })

    it('NO re-embebe si el patch no tocó campos de embedding', () => {
      expect(shouldReembedEntity({ patch: { essay: 'nuevo ensayo' }, current })).toBe(
        false,
      )
      expect(shouldReembedEntity({ patch: {}, current })).toBe(false)
    })

    it('NO re-embebe si la entidad no existe (current undefined)', () => {
      expect(shouldReembedEntity({ patch: { name: 'X' }, current: undefined })).toBe(
        false,
      )
    })

    it('trata year/description ausentes en el patch como cambio a null', () => {
      // year pasa de 1899 a null explícito.
      expect(shouldReembedEntity({ patch: { year: null }, current })).toBe(true)
      // description pasa de 'escritor' a null explícito.
      expect(shouldReembedEntity({ patch: { description: null }, current })).toBe(true)
      // year ya null en current + patch null -> sin cambio.
      expect(
        shouldReembedEntity({
          patch: { year: null },
          current: { ...current, year: null },
        }),
      ).toBe(false)
    })
  })

  describe('parseEntityCursor', () => {
    it('corta en el último ":" para preservar la hora del ISO timestamp', () => {
      expect(
        parseEntityCursor(
          '2026-05-21T16:12:30.000Z:11111111-1111-4111-8111-111111111111',
        ),
      ).toEqual({
        ts: '2026-05-21T16:12:30.000Z',
        id: '11111111-1111-4111-8111-111111111111',
      })
    })

    it('devuelve null para cursor vacío, null o malformado antes del cast SQL', () => {
      expect(parseEntityCursor(null)).toBeNull()
      expect(parseEntityCursor('')).toBeNull()
      // sin separador
      expect(parseEntityCursor('sololetras')).toBeNull()
      // separador en posición 0 (sin timestamp) -> inválido
      expect(parseEntityCursor(':abc')).toBeNull()
      // separador final (sin UUID) -> inválido
      expect(parseEntityCursor('2026-05-21T16:12:30.000Z:')).toBeNull()
      // timestamp no parseable -> inválido
      expect(
        parseEntityCursor('fecha-rara:11111111-1111-4111-8111-111111111111'),
      ).toBeNull()
      // UUID inválido -> inválido
      expect(parseEntityCursor('2026-05-21T16:12:30.000Z:abc-123')).toBeNull()
    })
  })

  describe('clampEntityLimit', () => {
    it('clampa al rango [1, 200] y usa default 50 si no es entero', () => {
      expect(clampEntityLimit('10')).toBe(10)
      expect(clampEntityLimit('0')).toBe(1)
      expect(clampEntityLimit('-5')).toBe(1)
      expect(clampEntityLimit('5000')).toBe(200)
      expect(clampEntityLimit('abc')).toBe(50)
      expect(clampEntityLimit(null)).toBe(50)
    })
  })

  describe('buildDuplicateSuggestions', () => {
    it('convierte la distancia coseno en similitud [0,1] y conserva el shape', () => {
      const out = buildDuplicateSuggestions([
        {
          id: 'e1',
          name: 'Borges',
          type: 'persona',
          description: 'escritor',
          distance: 0.2,
        },
        // distance como string (algunos drivers lo devuelven así).
        { id: 'e2', name: 'Bioy', type: 'persona', description: null, distance: '0' },
      ])

      expect(out).toEqual([
        {
          id: 'e1',
          name: 'Borges',
          type: 'persona',
          description: 'escritor',
          similarity: 0.9,
        },
        { id: 'e2', name: 'Bioy', type: 'persona', description: null, similarity: 1 },
      ])
    })

    it('clampa la similitud al rango [0,1] ante distancias fuera de [0,2]', () => {
      const [low] = buildDuplicateSuggestions([
        { id: 'x', name: 'X', type: 't', description: null, distance: 2.5 },
      ])
      expect(low.similarity).toBe(0)
    })
  })
})
