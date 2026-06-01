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

  it('exporta entidades, relaciones y citas en camelCase sin soft-deleted', async () => {
    mockSqlResponses.push(
      [
        {
          id: 'e1',
          type: 'persona',
          name: 'Borges',
          year: 1899,
          description: null,
          position_x: 12,
          position_y: null,
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
          origin: { kind: 'manual' },
          created_at: '2026-05-05T00:00:00.000Z',
          updated_at: '2026-05-06T00:00:00.000Z',
        },
      ],
    )

    const res = await handler(new Request('http://localhost/api/export'), mockContext())

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="trama-\d{4}-\d{2}-\d{2}\.json"$/,
    )
    expect(await res.json()).toMatchObject({
      version: 1,
      scope: {
        kind: 'legacy-partial',
        label: 'Export parcial legado',
        includes: ['entities', 'relationships', 'quotes'],
        excludes: expect.arrayContaining(['momentos', 'notes', 'tasks']),
      },
      entities: [
        {
          id: 'e1',
          type: 'persona',
          name: 'Borges',
          year: 1899,
          positionX: 12,
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
          origin: { kind: 'manual' },
        },
      ],
    })
    for (const call of mockSqlState.calls) {
      expect(call.template).toMatch(/deleted_at IS NULL/)
      expect(call.template).toMatch(/user_id/)
      expect(call.values).toContain('legacy-single-user')
    }
  })
})
