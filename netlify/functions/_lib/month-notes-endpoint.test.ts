import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

// El mock de db.js debe ir ANTES del import del handler (SUT vive en `../month-notes`).
vi.mock('./db.js', () => setupMockSql())

import handler from '../month-notes'

describe('month-notes endpoint — integration', () => {
  beforeEach(() => mockSqlResponses.reset())
  afterEach(() => vi.unstubAllGlobals())

  it('GET devuelve el contenido del mes', async () => {
    mockSqlResponses.push([{ month_key: '2026-06', content: 'cerrar presupuesto' }])
    const res = await handler(
      new Request('http://localhost/api/month-notes?month=2026-06'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      monthKey: '2026-06',
      content: 'cerrar presupuesto',
    })
  })

  it('GET sin nota guardada devuelve content vacío', async () => {
    mockSqlResponses.push([])
    const res = await handler(
      new Request('http://localhost/api/month-notes?month=2026-06'),
      mockContext(),
    )
    expect(await res.json()).toEqual({ monthKey: '2026-06', content: '' })
  })

  it('GET con month mal formado devuelve 400', async () => {
    const res = await handler(
      new Request('http://localhost/api/month-notes?month=2026'),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('PUT hace upsert (ON CONFLICT) y devuelve el contenido', async () => {
    mockSqlResponses.push(
      [], // ensureUserRow
      [{ month_key: '2026-06', content: 'texto nuevo' }],
    )
    const res = await handler(
      new Request('http://localhost/api/month-notes', {
        method: 'PUT',
        body: JSON.stringify({ month: '2026-06', content: 'texto nuevo' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ monthKey: '2026-06', content: 'texto nuevo' })
    const upsert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO month_notes/i.test(c.template),
    )
    expect(upsert?.template).toMatch(/ON CONFLICT/i)
  })

  it('PUT con month inválido devuelve 400 (validación Zod)', async () => {
    const res = await handler(
      new Request('http://localhost/api/month-notes', {
        method: 'PUT',
        body: JSON.stringify({ month: 'junio', content: 'x' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('método no soportado devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/month-notes', { method: 'DELETE' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })
})
