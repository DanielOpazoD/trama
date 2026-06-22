import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'
import { resetEnvCache } from './env'

vi.mock('./db.js', () => setupMockSql())

import handler, { resolveHealthAuthStatus } from '../health'

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
    // 11 respuestas: set_config RLS + 10 queries del handler.
    mockSqlResponses.push(
      [{ set_config: 'legacy-single-user' }],
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
    delete process.env['CLERK_SECRET_KEY']
    delete process.env['ALLOW_LEGACY_FALLBACK']
    delete process.env['LEGACY_OWNER_CLERK_ID']
    resetEnvCache()
    vi.unstubAllGlobals()
  })

  it('GET devuelve 200 con counts del usuario', async () => {
    const res = await handler(new Request('http://localhost/api/health'), mockContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.counts).toEqual({ entities: 5, quotes: 10, relationships: 3 })
    expect(body.month.costCents).toBeCloseTo(1.5, 4)
    // Sin señales problemáticas: sin alertas y estado global ok.
    expect(body.alerts).toEqual([])
    expect(body.status).toBe('ok')
  })

  it('deriva status critical y una alerta error ante una ráfaga de errores en 24h', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push(
      [{ set_config: 'legacy-single-user' }],
      [{ cap: null }], // users.monthly_budget_cents
      [{ c: '5' }], // entities
      [{ c: '10' }], // quotes
      [{ c: '3' }], // relationships
      [{ calls: '0', tokens_in: '0', tokens_out: '0', cost_cents: '0' }], // month
      [], // providers
      [], // errores 7d
      [{ c: '12' }], // errores 24h → ráfaga (>=10)
      [{ entities: '0', quotes: '0' }], // embeddings pendientes
      [], // daily cost
    )

    const res = await handler(new Request('http://localhost/api/health'), mockContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('critical')
    expect(body.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'errors_burst', severity: 'error' }),
      ]),
    )
    // Contrato de privacidad: la alerta resume el conteo, nunca contenido.
    expect(JSON.stringify(body.alerts)).not.toMatch(/@|sk_|bearer|jwt/i)
  })

  it('TODAS las queries de datos filtran por user_id', async () => {
    await handler(new Request('http://localhost/api/health'), mockContext())
    // Cada query ejecutada debe mencionar user_id — sin esto, Health
    // mostraría agregados globales cross-user.
    expect(mockSqlResponses.calls.length).toBeGreaterThanOrEqual(10)
    for (const call of mockSqlResponses.calls) {
      if (/set_config\('app\.current_user_id'/.test(call.template)) continue
      if (/FROM users/i.test(call.template)) continue
      expect(call.template).toMatch(/user_id/)
    }
  })

  it('usa users.monthly_budget_cents para mostrar el mismo cap que aplica cost-cap', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push(
      [{ set_config: 'legacy-single-user' }],
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

  it('expone el estado de cutover auth y alerta si el fallback legacy sigue activo', async () => {
    process.env['CLERK_SECRET_KEY'] = 'sk_test_health'
    process.env['ALLOW_LEGACY_FALLBACK'] = 'true'
    process.env['LEGACY_OWNER_CLERK_ID'] = 'user_owner'
    resetEnvCache()

    const res = await handler(new Request('http://localhost/api/health'), mockContext())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.auth).toEqual({
      clerkConfigured: true,
      legacyFallbackAllowed: true,
      legacyOwnerMapped: true,
      mode: 'clerk-with-legacy-fallback',
    })
    expect(body.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'auth_legacy_fallback',
          severity: 'warn',
        }),
      ]),
    )
  })

  it('expone modo legacy-single-user cuando Clerk no está configurado', async () => {
    const res = await handler(new Request('http://localhost/api/health'), mockContext())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.auth).toEqual({
      clerkConfigured: false,
      legacyFallbackAllowed: false,
      legacyOwnerMapped: false,
      mode: 'legacy-single-user',
    })
    expect(body.alerts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'auth_legacy_fallback' })]),
    )
  })

  it('resuelve modo clerk estricto sin filtrar secretos', async () => {
    process.env['CLERK_SECRET_KEY'] = 'sk_test_health_secret'
    process.env['ALLOW_LEGACY_FALLBACK'] = 'false'
    process.env['LEGACY_OWNER_CLERK_ID'] = 'user_owner'
    resetEnvCache()

    const auth = resolveHealthAuthStatus()

    expect(JSON.stringify(auth)).not.toContain('sk_test_health_secret')
    expect(auth).toEqual({
      clerkConfigured: true,
      legacyFallbackAllowed: false,
      legacyOwnerMapped: true,
      mode: 'clerk',
    })
  })

  it('expone contratos operacionales sin filtrar secretos ni datos de usuario', async () => {
    const res = await handler(
      new Request('http://localhost/api/health?token=secret', {
        headers: { 'x-request-id': 'rid-health' },
      }),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.operational).toEqual({
      requestId: 'rid-health',
      databaseReachable: true,
      runtimeApiRoutesContract: 'check:runtime-api-routes',
      productionSmokeCommand: 'npm run smoke:production-report',
      logRedaction: 'structured-redaction',
    })
    expect(JSON.stringify(body.operational)).not.toContain('secret')
  })

  it('interpola el id del usuario autenticado en las queries', async () => {
    await handler(new Request('http://localhost/api/health'), mockContext())
    // En tests, getAuthedUser cae a 'legacy-single-user' (sin Clerk).
    const first = mockSqlResponses.calls[0]!
    expect(first.template).toMatch(/set_config\('app\.current_user_id', \?, true\)/)
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
