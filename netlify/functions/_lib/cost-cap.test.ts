import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockSqlResponses, setupMockSql } from './test-utils'

// safeSql lee de getSql() — el mock se interpone.
vi.mock('./db.js', () => setupMockSql())

import { checkMonthlyBudget } from './cost-cap'
import { resetEnvCache } from './env'

// Netlify.env no existe en el test runtime. Lo stubeamos con un budget
// alto (1000 cents = $10) para que el cap del env no dispare por
// accidente en tests donde queremos chequear el cap del user.
function stubNetlifyEnv(envBudget = '1000') {
  vi.stubGlobal('Netlify', {
    env: {
      get: vi.fn((key: string) =>
        key === 'AI_MONTHLY_BUDGET_CENTS' ? envBudget : undefined,
      ),
    },
  })
}

describe('checkMonthlyBudget', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    resetEnvCache() // el budget se cachea entre tests; invalidamos.
    stubNetlifyEnv('1000')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    resetEnvCache()
  })

  it('con gasto debajo del cap, devuelve null (deja pasar)', async () => {
    mockSqlResponses.push([]) // users lookup → no row
    mockSqlResponses.push([{ total: '0' }]) // sum extraction_log
    const result = await checkMonthlyBudget('user_a', 'rid-1')
    expect(result).toBeNull()
  })

  it('si el gasto cruza el cap, devuelve 429 con ApiErrors shape', async () => {
    mockSqlResponses.push([]) // users lookup (no cap individual)
    mockSqlResponses.push([{ total: '1500' }]) // gastado > 1000
    const result = await checkMonthlyBudget('user_a', 'rid-1')
    expect(result).not.toBeNull()
    expect(result!.status).toBe(429)
    const body = await result!.json()
    expect(body.error.code).toBe('RATE_LIMITED')
    expect(body.error.requestId).toBe('rid-1')
    expect(body.error.details).toMatchObject({
      budgetCents: 1000,
      spentCents: 1500,
    })
  })

  it('usa el cap individual del user si users.monthly_budget_cents está seteado', async () => {
    // env=1000, user cap=200. Gasto 250 cruza el del user.
    mockSqlResponses.push([{ cap: 200 }])
    mockSqlResponses.push([{ total: '250' }])
    const result = await checkMonthlyBudget('user_a', 'rid-2')
    expect(result).not.toBeNull()
    const body = await result!.json()
    expect(body.error.details.budgetCents).toBe(200)
  })

  it('filtra extraction_log por user_id cuando se pasa userId', async () => {
    mockSqlResponses.push([{ cap: null }])
    mockSqlResponses.push([{ total: '0' }])
    await checkMonthlyBudget('user_specific', 'rid-3')
    const sumCall = mockSqlResponses.calls[1]!
    expect(sumCall.template).toMatch(/extraction_log/)
    expect(sumCall.template).toMatch(/user_id/)
    expect(sumCall.values).toContain('user_specific')
  })

  it('sin userId, hace la query global (no filtra por user_id)', async () => {
    mockSqlResponses.push([{ total: '0' }]) // solo 1 call: el SUM global
    await checkMonthlyBudget(undefined, 'rid-5')
    expect(mockSqlResponses.calls).toHaveLength(1)
    expect(mockSqlResponses.calls[0]!.template).not.toMatch(/user_id/)
  })

  it('si users.monthly_budget_cents es NULL, cae al env budget', async () => {
    // user existe pero cap NULL → usa env.
    mockSqlResponses.push([{ cap: null }])
    mockSqlResponses.push([{ total: '1500' }])
    const result = await checkMonthlyBudget('user_a', 'rid-6')
    const body = await result!.json()
    expect(body.error.details.budgetCents).toBe(1000) // del env
  })

  it('env vacío/0/invalid → default 500 cents', async () => {
    vi.unstubAllGlobals()
    resetEnvCache()
    vi.stubGlobal('Netlify', {
      env: { get: vi.fn(() => undefined) },
    })
    mockSqlResponses.push([])
    mockSqlResponses.push([{ total: '600' }])
    const result = await checkMonthlyBudget('user_a', 'rid-7')
    const body = await result!.json()
    expect(body.error.details.budgetCents).toBe(500)
  })
})
