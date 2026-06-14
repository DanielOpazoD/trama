import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import linkHandler from '../whatsapp-link'

/**
 * Endpoint whatsapp-link: genera/lista/desvincula. SQL mockeado (patrón
 * favoritos); se verifica el cableado HTTP, no la BD real.
 */
const VERIFIED_ROW = {
  id: '6f9619ff-8b86-4d01-b42d-00cf4fc964ff',
  phone_e164: '+56912345678',
  label: null,
  verified_at: '2026-06-13T12:00:00.000Z',
  last_message_at: null,
  created_at: '2026-06-13T11:00:00.000Z',
}

beforeEach(() => mockSqlResponses.reset())

describe('whatsapp-link endpoint', () => {
  it('GET lista los vínculos verificados', async () => {
    mockSqlResponses.push([VERIFIED_ROW])
    const res = await linkHandler(
      new Request('http://localhost/api/whatsapp-link'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0].phone_e164).toBe('+56912345678')
  })

  it('POST genera un código (201 con code + expiresAt)', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([
      {
        id: 'abc',
        link_code: 'ABC234',
        link_code_expires_at: '2026-06-13T12:15:00.000Z',
      },
    ])
    const res = await linkHandler(
      new Request('http://localhost/api/whatsapp-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      mockContext(),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.code).toBe('ABC234')
    expect(body.ttlMinutes).toBeGreaterThan(0)
  })

  it('DELETE 404 si el vínculo no existe', async () => {
    mockSqlResponses.push([]) // update no afecta filas
    const res = await linkHandler(
      new Request(`http://localhost/api/whatsapp-link/${VERIFIED_ROW.id}`, {
        method: 'DELETE',
      }),
      mockContext({ id: VERIFIED_ROW.id }),
    )
    expect(res.status).toBe(404)
  })

  it('DELETE ok si existe', async () => {
    mockSqlResponses.push([{ id: VERIFIED_ROW.id }])
    const res = await linkHandler(
      new Request(`http://localhost/api/whatsapp-link/${VERIFIED_ROW.id}`, {
        method: 'DELETE',
      }),
      mockContext({ id: VERIFIED_ROW.id }),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  it('PUT no permitido', async () => {
    const res = await linkHandler(
      new Request('http://localhost/api/whatsapp-link', { method: 'PUT' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })
})
