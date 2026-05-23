import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './_lib/test-utils'

// El mock del módulo db tiene que estar ANTES del import del handler.
vi.mock('./_lib/db.js', () => setupMockSql())
// observability.persistError usa safeSql() que llama al wrapper; con el
// mock de db.js arriba ya retorna sql, así que persistError intenta hacer
// INSERT INTO error_log... pero como el mock devuelve [] sin error, está OK.
// Adicionalmente neutralizamos cualquier llamada a fetch (embeddings).
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: false,
  status: 500,
  text: async () => '',
  json: async () => ({}),
}))

import handler from './entities'

describe('entities endpoint — integration', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '',
      json: async () => ({}),
    }))
  })

  describe('GET /api/entities', () => {
    it('devuelve la lista wholesale en formato camelCase', async () => {
      // Respuesta del SELECT (snake_case en la DB)
      mockSqlResponses.push([
        {
          id: 'e1',
          type: 'persona',
          name: 'Borges',
          year: 1899,
          description: 'escritor',
          essay: null,
          position_x: null,
          position_y: null,
          origin: { kind: 'manual' },
          spotify_url: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ])

      const req = new Request('http://localhost/api/entities')
      const res = await handler(req, mockContext())

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0]).toEqual(
        expect.objectContaining({
          id: 'e1',
          type: 'persona',
          name: 'Borges',
        }),
      )
    })

    it('soporta paginación con cursor', async () => {
      mockSqlResponses.push([
        {
          id: 'e1',
          type: 'persona',
          name: 'A',
          year: null,
          description: null,
          essay: null,
          position_x: null,
          position_y: null,
          origin: { kind: 'manual' },
          spotify_url: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ])

      const req = new Request('http://localhost/api/entities?limit=10')
      const res = await handler(req, mockContext())

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('items')
      expect(body).toHaveProperty('nextCursor')
    })
  })

  describe('DELETE /api/entities/:id', () => {
    it('devuelve { deletedAt } y ejecuta 4 queries (NOW + 3 UPDATEs)', async () => {
      mockSqlResponses.push(
        [{ now: '2026-05-23T12:00:00Z' }], // SELECT NOW()
        [], // UPDATE entities
        [], // UPDATE relationships
        [], // UPDATE quotes
      )

      const req = new Request('http://localhost/api/entities/abc', {
        method: 'DELETE',
      })
      const res = await handler(req, mockContext({ id: 'abc' }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.deletedAt).toBe('2026-05-23T12:00:00Z')

      // Verifica que se ejecutaron los 4 SQL: NOW + entities + relationships + quotes
      expect(mockSqlResponses.calls.length).toBeGreaterThanOrEqual(4)
      // Y que el id 'abc' apareció en los values de algún UPDATE
      const allValues = mockSqlResponses.calls.flatMap((c) => c.values)
      expect(allValues).toContain('abc')
    })
  })

  describe('POST /api/entities/:id/restore', () => {
    it('400 si falta deletedAt', async () => {
      const req = new Request('http://localhost/api/entities/abc/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const res = await handler(req, mockContext({ id: 'abc' }))
      expect(res.status).toBe(400)
    })

    it('200 + { restored: true } cuando deletedAt es válido', async () => {
      mockSqlResponses.push(
        [], // UPDATE entities SET deleted_at=NULL
        [], // UPDATE relationships
        [], // UPDATE quotes
      )

      const req = new Request('http://localhost/api/entities/abc/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletedAt: '2026-05-23T12:00:00Z' }),
      })
      const res = await handler(req, mockContext({ id: 'abc' }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.restored).toBe(true)
      // 3 queries de restore + posibles queries internas de validación
      expect(mockSqlResponses.calls.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('Method not allowed', () => {
    it('PUT devuelve 405', async () => {
      const req = new Request('http://localhost/api/entities/abc', {
        method: 'PUT',
        body: JSON.stringify({ name: 'x' }),
      })
      const res = await handler(req, mockContext({ id: 'abc' }))
      expect(res.status).toBe(405)
    })
  })
})
