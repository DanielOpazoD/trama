import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

describe('cost-alert-check scheduled function', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSqlResponses.reset()
    vi.stubGlobal('Netlify', {
      env: {
        get: vi.fn((key: string) => {
          if (key === 'AI_MONTHLY_BUDGET_CENTS') return '5000'
          if (key === 'COST_ALERT_THRESHOLD_PCT') return '0.8'
          if (key === 'COST_ALERT_WEBHOOK_URL') return 'https://hooks.example.test/trama'
          return undefined
        }),
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rechaza GET con 405 antes de tocar SQL o webhooks', async () => {
    const { default: handler } = await import('../cost-alert-check')

    const res = await handler(
      new Request('http://localhost/.netlify/functions/cost-alert-check'),
    )

    expect(res.status).toBe(405)
    expect(
      mockSqlResponses.calls.some((call) =>
        /FROM monthly_spend|FROM extraction_log|alert_state/i.test(call.template),
      ),
    ).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('evalua gasto y alert_state por usuario, no de forma global', async () => {
    const { default: handler } = await import('../cost-alert-check')

    mockSqlResponses.push(
      [
        { user_id: 'alice', total: '9000', monthly_budget_cents: 10000 },
        { user_id: 'bob', total: '1000', monthly_budget_cents: null },
      ],
      [], // DELETE alerta vieja de bob (bajo threshold)
      [], // SELECT alert_state de alice
      [], // INSERT alert_state de alice
    )

    const res = await handler(
      new Request('http://localhost/.netlify/functions/cost-alert-check', {
        method: 'POST',
      }),
    )

    expect(res.status).toBe(202)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      'https://hooks.example.test/trama',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"userId":"alice"'),
      }),
    )

    const templates = mockSqlResponses.calls.map((c) => c.template).join('\n')
    expect(templates).toContain('GROUP BY user_id')
    expect(templates).toContain('LEFT JOIN users u ON u.id = s.user_id')
    expect(
      mockSqlResponses.calls.some((c) => c.values.includes('cost-cap-warning:alice')),
    ).toBe(true)
    expect(
      mockSqlResponses.calls.some((c) => c.values.includes('cost-cap-warning:bob')),
    ).toBe(true)
    expect(
      mockSqlResponses.calls.some((c) => c.values.includes('cost-cap-warning')),
    ).toBe(false)
  })

  it('throttlea por usuario sin bloquear alertas de otros usuarios', async () => {
    const { default: handler } = await import('../cost-alert-check')

    mockSqlResponses.push(
      [
        { user_id: 'alice', total: '9000', monthly_budget_cents: 10000 },
        { user_id: 'bob', total: '4900', monthly_budget_cents: 5000 },
      ],
      [{ last_sent_at: new Date().toISOString() }], // alice throttled
      [], // bob state
      [], // bob insert
    )

    const res = await handler(
      new Request('http://localhost/.netlify/functions/cost-alert-check', {
        method: 'POST',
      }),
    )

    expect(res.status).toBe(202)
    expect(fetch).toHaveBeenCalledTimes(1)
    const fetchMock = vi.mocked(fetch)
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))
    expect(body.userId).toBe('bob')
    expect(
      mockSqlResponses.calls.some((c) => c.values.includes('cost-cap-warning:alice')),
    ).toBe(true)
    expect(
      mockSqlResponses.calls.some((c) => c.values.includes('cost-cap-warning:bob')),
    ).toBe(true)
  })
})
