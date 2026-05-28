import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
// ALLOW_LEGACY_FALLBACK=true → getAuthedUser() devuelve el usuario legacy
// (no hay CLERK_SECRET_KEY en el test runtime) en vez de lanzar.
vi.stubGlobal('Netlify', {
  env: {
    get: vi.fn((key: string) => (key === 'ALLOW_LEGACY_FALLBACK' ? 'true' : undefined)),
  },
})
// El LLM no debería llegar a invocarse en estos contract tests (cubrimos
// solo method/validation branches). Si llegara, fetch falla y no rompe.
vi.stubGlobal(
  'fetch',
  vi
    .fn()
    .mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '',
      json: async () => ({}),
    }),
)

import handler from '../extract'

/**
 * BB6 / tarea #282: tests de contrato para `extract.mts`. Cubrimos las
 * branches baratas y de mayor riesgo sin tocar el LLM:
 *   - método ≠ POST → 405 (chequeo antes de auth)
 *   - body sin `text` → 400 VALIDATION (Zod)
 *   - text whitespace puro → 400 VALIDATION (trim en el handler)
 *
 * El happy path con extracción real se prueba end-to-end; acá blindamos
 * el contrato de errores para que no se rompa silenciosamente.
 */
describe('extract endpoint — contrato', () => {
  beforeEach(() => mockSqlResponses.reset())
  afterEach(() => mockSqlResponses.reset())

  it('rechaza método ≠ POST con 405 (antes de auth, sin SQL)', async () => {
    const res = await handler(
      new Request('http://localhost/api/extract', { method: 'GET' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  it('devuelve 400 VALIDATION si falta el campo text', async () => {
    // checkMonthlyBudget corre antes del parse: 2 queries (cap + SUM).
    mockSqlResponses.push([], [])

    const res = await handler(
      new Request('http://localhost/api/extract', { method: 'POST', body: '{}' }),
      mockContext(),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('VALIDATION')
  })

  it('devuelve 400 si text es whitespace puro', async () => {
    mockSqlResponses.push([], [])

    const res = await handler(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        body: JSON.stringify({ text: '   ' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('VALIDATION')
    expect(body.error.message).toMatch(/text/i)
  })
})
