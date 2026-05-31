import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'
import { resetEnvCache } from './env'

vi.mock('./db.js', () => setupMockSql())

import handler from '../health'

/**
 * health endpoint — contrato de aislamiento multi-usuario.
 *
 * Health agrega counts/costos/errores. El riesgo crítico multi-user es que
 * agregue GLOBALMENTE (un usuario vería la trama de todos). Estos tests
 * verifican que TODAS las queries con datos se filtran por user_id.
 */
describe('health endpoint — aislamiento por user_id', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    process.env['AI_MONTHLY_BUDGET_CENTS'] = '5000'
    resetEnvCache()
    // 10 respuestas en el orden del Promise.all del handler.
    mockSqlResponses.push(
      [{ cap: null }], // users.monthly_budget_cents
      [{ c: '5' }], // entities count
      [{ c: '10' }], // quotes count
      [{ c: '3' }], // relationships count
      [{ calls: '2', tokens_in: '100', tokens_out: '50', cost_cents: '1.5' }], // month
      [], // providers
      [], // errores 7d
      [{ c: '0' }], // errores 24h
      [{ entities: '0', quotes: '0' }], // embeddings pendientes
      [], // daily cost
    )
  })
  afterEach(() => {
    delete process.env['AI_MONTHLY_BUDGET_CENTS']
    resetEnvCache()
    vi.unstubAllGlobals()
  })

  it('GET devuelve 200 con counts del usuario', async () => {
    const res = await handler(new Request('http://localhost/api/health'), mockContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.counts).toEqual({ entities: 5, quotes: 10, relationships: 3 })
    expect(body.month.costCents).toBeCloseTo(1.5, 4)
  })

  it('TODAS las queries de datos filtran por user_id', async () => {
    await handler(new Request('http://localhost/api/health'), mockContext())
    // Cada query ejecutada debe mencionar user_id — sin esto, Health
    // mostraría agregados globales cross-user.
    expect(mockSqlResponses.calls.length).toBeGreaterThanOrEqual(10)
    for (const call of mockSqlResponses.calls) {
      if (/FROM users/i.test(call.template)) continue
      expect(call.template).toMatch(/user_id/)
    }
  })

  it('usa users.monthly_budget_cents para mostrar el mismo cap que aplica cost-cap', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push(
      [{ cap: 200 }], // users.monthly_budget_cents
      [{ c: '5' }],
      [{ c: '10' }],
      [{ c: '3' }],
      [{ calls: '2', tokens_in: '100', tokens_out: '50', cost_cents: '150' }],
      [],
      [],
      [{ c: '0' }],
      [{ entities: '0', quotes: '0' }],
      [],
    )

    const res = await handler(new Request('http://localhost/api/health'), mockContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.budget.limitCents).toBe(200)
    expect(body.budget.remainingCents).toBe(50)
    expect(body.budget.pct).toBe(0.75)
    expect(body.alerts).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'budget_high' })]),
    )
  })

  it('si el cap del usuario es null cae al fallback AI_MONTHLY_BUDGET_CENTS', async () => {
    const res = await handler(new Request('http://localhost/api/health'), mockContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.budget.limitCents).toBe(5000)
  })

  it('interpola el id del usuario autenticado en las queries', async () => {
    await handler(new Request('http://localhost/api/health'), mockContext())
    // En tests, getAuthedUser cae a 'legacy-single-user' (sin Clerk).
    const first = mockSqlResponses.calls[0]!
    expect(first.values).toContain('legacy-single-user')
  })

  it('método no GET devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/health', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })
})
