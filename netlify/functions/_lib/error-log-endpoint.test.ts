import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

// Test vive en _lib/ por restricciones de naming de Netlify Functions.
// Handler en `../`, mock del db en `./db.js`.
vi.mock('./db.js', () => setupMockSql())

import handler from '../error-log'

describe('error-log endpoint — integration', () => {
  beforeEach(() => mockSqlResponses.reset())
  afterEach(() => vi.unstubAllGlobals())

  it('GET devuelve histórico ordenado', async () => {
    mockSqlResponses.push([
      {
        id: 'err1',
        function_name: 'entities',
        http_method: 'POST',
        http_path: '/api/entities',
        status_code: 500,
        message: 'algo falló',
        stack: null,
        context: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ])
    const res = await handler(
      new Request('http://localhost/api/error-log'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0]).toEqual(
      expect.objectContaining({
        id: 'err1',
        functionName: 'entities',
        statusCode: 500,
      }),
    )
  })

  it('POST persiste error del cliente con function_name=client', async () => {
    mockSqlResponses.push([]) // INSERT
    const res = await handler(
      new Request('http://localhost/api/error-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Cannot read property of undefined',
          stack: 'Error at foo...',
          componentStack: 'in App',
          path: '/inicio',
          userAgent: 'Mozilla/5.0',
        }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(204)
    // El INSERT mete 'client' literal en el template SQL (no como parámetro);
    // el message sí va como parámetro y debe estar en values.
    const lastCall = mockSqlResponses.calls[mockSqlResponses.calls.length - 1]
    expect(lastCall.template).toMatch(/INSERT INTO error_log/i)
    expect(lastCall.template).toContain("'client'")
    expect(lastCall.values).toContain('Cannot read property of undefined')
  })

  it('POST sin message devuelve 400', async () => {
    const res = await handler(
      new Request('http://localhost/api/error-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('Method no soportado devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/error-log', { method: 'PATCH' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })
})
