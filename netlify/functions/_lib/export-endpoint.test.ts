import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../export'

describe('export endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
  })

  it('rechaza métodos no GET con ApiErrors', async () => {
    const res = await handler(
      new Request('http://localhost/api/export', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(405)
    expect(await res.json()).toMatchObject({ error: { code: 'METHOD_NOT_ALLOWED' } })
  })

  it('exporta el backup estructurado core en camelCase sin soft-deleted', async () => {
    mockSqlResponses.push(
      [
        {
          id: 'e1',
          type: 'persona',
          name: 'Borges',
          year: 1899,
          description: null,
          essay: 'Ensayo breve',
          position_x: 12,
          position_y: null,
          spotify_url: null,
          wikipedia_url: 'https://es.wikipedia.org/wiki/Jorge_Luis_Borges',
          grokipedia_url: null,
          origin: { kind: 'manual' },
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-02T00:00:00.000Z',
        },
      ],
      [
        {
          id: 'r1',
          from_id: 'e1',
          to_id: 'e2',
          type: 'cita_a',
          notes: null,
          origin: { kind: 'ai', provider: 'openai' },
          created_at: '2026-05-03T00:00:00.000Z',
          updated_at: '2026-05-04T00:00:00.000Z',
        },
      ],
      [
        {
          id: 'q1',
          entity_id: 'e1',
          text: 'El tiempo',
          source: null,
          context: 'ensayo',
          user_reflection: 'mi nota',
          ai_reflection: null,
          ai_reflection_provider: null,
          ai_reflection_model: null,
          ai_reflection_at: null,
          linked_quote_ids: ['q2'],
          pinned_at: null,
          resonance: 5,
          link: 'https://example.com',
          origin: { kind: 'manual' },
          created_at: '2026-05-05T00:00:00.000Z',
          updated_at: '2026-05-06T00:00:00.000Z',
        },
      ],
      [
        {
          id: 'm1',
          kind: 'foto',
          captured_at: '2026-05-07T00:00:00.000Z',
          payload: {
            items: [{ storageKey: 'legacy-single-user/foto.png' }],
            audioKey: 'legacy-single-user/audio.webm',
          },
          note: 'voz y foto',
          origin: { kind: 'manual' },
          created_at: '2026-05-07T00:00:00.000Z',
          updated_at: '2026-05-08T00:00:00.000Z',
        },
      ],
      [{ momento_id: 'm1', entity_id: 'e1' }],
      [
        {
          id: 'n1',
          content: 'nota #tag',
          tags: ['tag'],
          pinned: true,
          promoted_momento_id: 'm1',
          origin: { kind: 'manual' },
          created_at: '2026-05-09T00:00:00.000Z',
          updated_at: '2026-05-10T00:00:00.000Z',
        },
      ],
      [
        {
          id: 't1',
          title: 'hacer backup',
          detail: null,
          done: false,
          due_date: '2026-06-02',
          completed_at: null,
          tags: ['ops'],
          origin: { kind: 'manual' },
          created_at: '2026-05-11T00:00:00.000Z',
          updated_at: '2026-05-12T00:00:00.000Z',
        },
      ],
    )

    const res = await handler(new Request('http://localhost/api/export'), mockContext())

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="trama-\d{4}-\d{2}-\d{2}\.json"$/,
    )
    expect(await res.json()).toMatchObject({
      version: 2,
      scope: {
        kind: 'structured-core',
        label: 'Backup estructurado core',
        includes: expect.arrayContaining([
          'entities',
          'relationships',
          'quotes',
          'momentos',
          'momento_entities',
          'notes',
          'tasks',
        ]),
        excludes: expect.arrayContaining(['netlify_blobs_binary', 'oauth_tokens']),
      },
      entities: [
        {
          id: 'e1',
          type: 'persona',
          name: 'Borges',
          year: 1899,
          essay: 'Ensayo breve',
          positionX: 12,
          wikipediaUrl: 'https://es.wikipedia.org/wiki/Jorge_Luis_Borges',
          origin: { kind: 'manual' },
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-02T00:00:00.000Z',
        },
      ],
      relationships: [
        {
          id: 'r1',
          fromId: 'e1',
          toId: 'e2',
          type: 'cita_a',
          origin: { kind: 'ai', provider: 'openai' },
        },
      ],
      quotes: [
        {
          id: 'q1',
          entityId: 'e1',
          text: 'El tiempo',
          context: 'ensayo',
          userReflection: 'mi nota',
          linkedQuoteIds: ['q2'],
          resonance: 5,
          link: 'https://example.com',
          origin: { kind: 'manual' },
        },
      ],
      momentos: [
        {
          id: 'm1',
          kind: 'foto',
          capturedAt: '2026-05-07T00:00:00.000Z',
          payload: {
            items: [{ storageKey: 'legacy-single-user/foto.png' }],
            audioKey: 'legacy-single-user/audio.webm',
          },
          note: 'voz y foto',
          entityIds: ['e1'],
        },
      ],
      notes: [
        {
          id: 'n1',
          content: 'nota #tag',
          tags: ['tag'],
          pinned: true,
          promotedMomentoId: 'm1',
        },
      ],
      tasks: [
        {
          id: 't1',
          title: 'hacer backup',
          done: false,
          dueDate: '2026-06-02',
          tags: ['ops'],
        },
      ],
      blobReferences: ['legacy-single-user/audio.webm', 'legacy-single-user/foto.png'],
    })
    for (const call of mockSqlState.calls) {
      expect(call.template).toMatch(/deleted_at IS NULL/)
      expect(call.template).toMatch(/user_id/)
      expect(call.values).toContain('legacy-single-user')
    }
  })
})
