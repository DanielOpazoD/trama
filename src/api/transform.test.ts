import { describe, expect, it } from 'vitest'
import { entityFromRow } from './transform'

describe('entityFromRow', () => {
  it('preserva essay y URLs al cruzar la frontera snake_case a camelCase', () => {
    expect(
      entityFromRow({
        id: 'e1',
        type: 'persona',
        name: 'Ada',
        year: 1815,
        description: 'matemática',
        essay: 'Una nota larga sobre Ada.',
        position_x: 10,
        position_y: null,
        origin: { kind: 'manual' },
        spotify_url: null,
        wikipedia_url: 'https://example.com/ada',
        grokipedia_url: 'https://example.com/grok/ada',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-02T00:00:00.000Z',
      }),
    ).toMatchObject({
      id: 'e1',
      essay: 'Una nota larga sobre Ada.',
      positionX: 10,
      positionY: undefined,
      wikipediaUrl: 'https://example.com/ada',
      grokipediaUrl: 'https://example.com/grok/ada',
    })
  })
})
