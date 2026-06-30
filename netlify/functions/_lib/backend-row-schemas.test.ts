import { describe, expect, it } from 'vitest'
import { parseRows } from './row-parse.js'
import {
  EntityRowSchema,
  MomentoListRowSchema,
  NoteRowSchema,
  QuoteRowSchema,
  SearchQuoteRowSchema,
} from './backend-row-schemas.js'

describe('backend row schemas', () => {
  it('EntityRowSchema acepta timestamps como string o Date', () => {
    const [row] = parseRows(
      [
        {
          id: 'e1',
          type: 'persona',
          name: 'Borges',
          year: null,
          description: null,
          essay: null,
          position_x: null,
          position_y: null,
          origin: { kind: 'manual' },
          spotify_url: null,
          wikipedia_url: null,
          grokipedia_url: null,
          created_at: new Date('2026-06-22T12:00:00.000Z'),
          updated_at: '2026-06-22T12:00:00.000Z',
        },
      ],
      EntityRowSchema,
      'entities.list.test',
    )

    expect(row.name).toBe('Borges')
  })

  it('NoteRowSchema falla con context si el SELECT omite has_audio', () => {
    expect(() =>
      parseRows(
        [
          {
            id: 'n1',
            content: 'nota',
            title: null,
            tags: ['x'],
            pinned: false,
            promoted_momento_id: null,
            source: null,
            created_at: '2026-06-22T12:00:00.000Z',
            updated_at: '2026-06-22T12:00:00.000Z',
            has_images: false,
          },
        ],
        NoteRowSchema,
        'notes.list.test',
      ),
    ).toThrow(/notes\.list\.test.*has_audio/s)
  })

  it('MomentoListRowSchema valida owner/access/shared de la lista', () => {
    const [row] = parseRows(
      [
        {
          id: 'm1',
          kind: 'nota',
          captured_at: '2026-06-22T12:00:00.000Z',
          payload: { bodyText: 'x' },
          note: null,
          origin: { kind: 'manual' },
          created_at: '2026-06-22T12:00:00.000Z',
          updated_at: new Date('2026-06-22T12:00:00.000Z'),
          owner_user_id: 'u1',
          owner_display_name: null,
          owner_email: 'u1@example.test',
          access_role: 'owner',
          shared: false,
        },
      ],
      MomentoListRowSchema,
      'momentos.list.test',
    )

    expect(row.access_role).toBe('owner')
  })

  it('SearchQuoteRowSchema falla si falta entity_name', () => {
    expect(() =>
      parseRows(
        [
          {
            id: 'q1',
            entity_id: 'e1',
            text: 'cita',
            source: null,
            rank: 1,
          },
        ],
        SearchQuoteRowSchema,
        'search.lexical.quotes.test',
      ),
    ).toThrow(/search\.lexical\.quotes\.test.*entity_name/s)
  })

  it('QuoteRowSchema falla con context si el SELECT omite pinned_at', () => {
    expect(() =>
      parseRows(
        [
          {
            id: 'q1',
            entity_id: 'e1',
            text: 'cita',
            source: null,
            context: null,
            link: null,
            user_reflection: null,
            ai_reflection: null,
            ai_reflection_provider: null,
            ai_reflection_model: null,
            ai_reflection_at: null,
            linked_quote_ids: [],
            resonance: null,
            origin: { kind: 'manual' },
            created_at: '2026-06-22T12:00:00.000Z',
            updated_at: '2026-06-22T12:00:00.000Z',
          },
        ],
        QuoteRowSchema,
        'quotes.list.test',
      ),
    ).toThrow(/quotes\.list\.test.*pinned_at/s)
  })
})
