import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../cronologia'

describe('cronologia endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
  })

  it('rechaza métodos distintos de GET con ApiErrors', async () => {
    const res = await handler(
      new Request('http://localhost/api/cronologia', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(405)
    expect(await res.json()).toMatchObject({
      error: { code: 'METHOD_NOT_ALLOWED' },
    })
  })

  it('mezcla citas, momentos, crónicas y escuchas newest-first en shape camelCase', async () => {
    mockSqlResponses.push(
      [
        {
          id: 'q1',
          occurred_at: '2026-05-30T12:00:00.000Z',
          text: 'El tiempo',
          source: 'Ensayo',
          entity_id: 'e1',
          entity_name: 'Borges',
        },
      ],
      [
        {
          id: 'm1',
          occurred_at: '2026-05-31T09:00:00.000Z',
          momento_kind: 'nota',
          text: 'Caminata',
        },
      ],
      [
        {
          id: 'c1',
          occurred_at: '2026-05-31T23:59:59.000Z',
          year: 2026,
          month: 5,
          text: 'Mayo fue un archivo.',
        },
      ],
      [
        {
          id: '2026-05-25',
          occurred_at: '2026-05-29T18:00:00.000Z',
          week_start: '2026-05-25',
          top_artist: 'Miles Davis',
          top_artist_plays: 9,
          total_plays: 18,
        },
      ],
    )

    const res = await handler(
      new Request(
        'http://localhost/api/cronologia?before=2026-06-01T00:00:00.000Z&limit=10',
      ),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      entradas: [
        {
          kind: 'cronica',
          id: 'c1',
          occurredAt: '2026-05-31T23:59:59.000Z',
          year: 2026,
          month: 5,
          text: 'Mayo fue un archivo.',
        },
        {
          kind: 'momento',
          id: 'm1',
          occurredAt: '2026-05-31T09:00:00.000Z',
          momentoKind: 'nota',
          text: 'Caminata',
        },
        {
          kind: 'cita',
          id: 'q1',
          occurredAt: '2026-05-30T12:00:00.000Z',
          text: 'El tiempo',
          source: 'Ensayo',
          entityId: 'e1',
          entityName: 'Borges',
        },
        {
          kind: 'escucha',
          id: '2026-05-25',
          occurredAt: '2026-05-29T18:00:00.000Z',
          weekStart: '2026-05-25',
          topArtist: 'Miles Davis',
          topArtistPlays: 9,
          totalPlays: 18,
        },
      ],
      nextCursor: null,
    })
    expect(mockSqlState.calls).toHaveLength(4)
    for (const call of mockSqlState.calls) {
      expect(call.template).toMatch(/user_id/)
      expect(call.values).toContain('legacy-single-user')
      expect(call.values).toContain('2026-06-01T00:00:00.000Z')
      expect(call.values).toContain(10)
    }
  })

  it('aplica marca de agua cuando una corriente puede ocultar filas más viejas', async () => {
    mockSqlResponses.push(
      [
        {
          id: 'q-new',
          occurred_at: '2026-05-31T10:00:00.000Z',
          text: 'Nueva',
          source: null,
          entity_id: 'e1',
          entity_name: 'Borges',
        },
        {
          id: 'q-tail',
          occurred_at: '2026-05-30T10:00:00.000Z',
          text: 'Cola',
          source: null,
          entity_id: 'e1',
          entity_name: 'Borges',
        },
      ],
      [
        {
          id: 'm-safe',
          occurred_at: '2026-05-30T12:00:00.000Z',
          momento_kind: 'nota',
          text: 'Entre medio',
        },
      ],
      [
        {
          id: 'c-unsafe',
          occurred_at: '2026-05-29T12:00:00.000Z',
          year: 2026,
          month: 5,
          text: 'Más vieja',
        },
      ],
      [],
    )

    const res = await handler(
      new Request('http://localhost/api/cronologia?limit=2'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      entradas: [
        expect.objectContaining({ kind: 'cita', id: 'q-new' }),
        expect.objectContaining({ kind: 'momento', id: 'm-safe' }),
      ],
      nextCursor: '2026-05-30T12:00:00.000Z',
    })
    expect(mockSqlState.calls[0]?.values).toContain('9999-12-31T23:59:59.000Z')
    expect(mockSqlState.calls[0]?.values).toContain(2)
  })

  it('normaliza límites inválidos o excesivos antes de consultar', async () => {
    mockSqlResponses.push([], [], [], [])

    const res = await handler(
      new Request('http://localhost/api/cronologia?limit=999'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ entradas: [], nextCursor: null })
    for (const call of mockSqlState.calls) {
      expect(call.values).toContain(100)
    }
  })
})
