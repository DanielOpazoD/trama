/**
 * EE-followup: tests del endpoint /api/momentos-restore.
 *
 * Contratos clave:
 *   - 405 en GET
 *   - 400 sin id o sin deletedAt
 *   - 409 si el row no existe o el deletedAt no matchea
 *   - 200 con momento restaurado + entity_ids preservados
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../momentos-restore'

describe('momentos-restore endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('405 a GET', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos-restore', { method: 'GET' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  it('400 sin id', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos-restore', {
        method: 'POST',
        body: JSON.stringify({ deletedAt: '2026-05-25T13:00:00Z' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('400 sin deletedAt', async () => {
    const res = await handler(
      new Request('http://localhost/api/momentos-restore', {
        method: 'POST',
        body: JSON.stringify({ id: 'abc' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('409 si el UPDATE no afecta filas (id no existe o deletedAt no matchea)', async () => {
    // UPDATE devuelve 0 rows — el WHERE no matcheó (ya restaurado, o id wrong,
    // o deletedAt cambió por otro flujo).
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([])
    const res = await handler(
      new Request('http://localhost/api/momentos-restore', {
        method: 'POST',
        body: JSON.stringify({
          id: '11111111-1111-1111-1111-111111111111',
          deletedAt: '2026-05-25T13:00:00Z',
        }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(409)
  })

  it('200 con el momento restaurado + entity_ids', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([
      {
        id: '11111111-1111-1111-1111-111111111111',
        kind: 'foto',
        captured_at: '2026-05-22T10:00:00Z',
        payload: { items: [{ storageKey: 'a.jpg' }] },
        note: 'restored',
        origin: { kind: 'manual' },
        created_at: '2026-05-22T10:00:00Z',
        updated_at: '2026-05-25T14:00:00Z',
      },
    ])
    mockSqlResponses.push([{ entity_id: 'e-1' }, { entity_id: 'e-2' }])

    const res = await handler(
      new Request('http://localhost/api/momentos-restore', {
        method: 'POST',
        body: JSON.stringify({
          id: '11111111-1111-1111-1111-111111111111',
          deletedAt: '2026-05-25T13:00:00Z',
        }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('11111111-1111-1111-1111-111111111111')
    expect(body.note).toBe('restored')
    expect(body.entity_ids).toEqual(['e-1', 'e-2'])
  })
})
