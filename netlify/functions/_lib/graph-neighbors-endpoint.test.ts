import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../graph-neighbors'

const focal = {
  id: 'e1',
  type: 'persona',
  name: 'Borges',
  year: 1899,
  description: 'autor',
  essay: null,
  position_x: 1,
  position_y: 2,
  origin: { kind: 'manual' },
  spotify_url: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-02',
}

describe('graph-neighbors endpoint', () => {
  beforeEach(() => mockSqlResponses.reset())

  it('valida método y parámetro from', async () => {
    const method = await handler(
      new Request('http://localhost/api/graph/neighbors', { method: 'POST' }),
      mockContext(),
    )
    expect(method.status).toBe(405)

    const missing = await handler(
      new Request('http://localhost/api/graph/neighbors'),
      mockContext(),
    )
    expect(missing.status).toBe(400)
  })

  it('devuelve 404 si la entidad focal no existe para el usuario', async () => {
    mockSqlResponses.push([])

    const res = await handler(
      new Request('http://localhost/api/graph/neighbors?from=e1'),
      mockContext(),
    )

    expect(res.status).toBe(404)
    expect(mockSqlResponses.calls[0]?.template).toMatch(/deleted_at IS NULL/)
    expect(mockSqlResponses.calls[0]?.template).toMatch(/user_id/)
  })

  it('construye subgrafo con hops/limit acotados y shape camelCase', async () => {
    mockSqlResponses.push(
      [focal],
      [
        { id: 'e1', hop_distance: 0, degree: '3' },
        { id: 'e2', hop_distance: 1, degree: '2' },
      ],
      [
        focal,
        {
          ...focal,
          id: 'e2',
          name: 'Bioy',
          position_x: null,
          position_y: null,
        },
      ],
      [
        {
          id: 'r1',
          from_id: 'e1',
          to_id: 'e2',
          type: 'amistad',
          notes: 'Sur',
          origin: { kind: 'manual' },
          created_at: '2026-01-03',
          updated_at: '2026-01-04',
        },
      ],
    )

    const res = await handler(
      new Request('http://localhost/api/graph/neighbors?from=e1&hops=99&limit=999'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      from: { ...focal, hopDistance: 0 },
      entities: [
        expect.objectContaining({
          id: 'e1',
          name: 'Borges',
          positionX: 1,
          positionY: 2,
          hopDistance: 0,
        }),
        expect.objectContaining({
          id: 'e2',
          name: 'Bioy',
          positionX: null,
          positionY: null,
          hopDistance: 1,
        }),
      ],
      relationships: [
        {
          id: 'r1',
          fromId: 'e1',
          toId: 'e2',
          type: 'amistad',
          notes: 'Sur',
          origin: { kind: 'manual' },
          createdAt: '2026-01-03',
          updatedAt: '2026-01-04',
        },
      ],
      hops: 3,
      limit: 500,
      truncated: false,
    })
  })

  it('omite edges si la ventana tiene menos de dos entidades', async () => {
    mockSqlResponses.push([focal], [{ id: 'e1', hop_distance: 0, degree: '0' }], [focal])

    const res = await handler(
      new Request('http://localhost/api/graph/neighbors?from=e1&hops=1&limit=1'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.relationships).toEqual([])
    expect(body.truncated).toBe(true)
  })
})
