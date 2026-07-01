import { describe, expect, it } from 'vitest'
import type { HealthResponse } from '../../api'
import {
  buildHealthDiagnostic,
  dedupHealthErrors,
  resolveBudgetTone,
} from './healthPanelModel'

const HEALTH: HealthResponse = {
  counts: { entities: 1, quotes: 2, relationships: 3 },
  month: { calls: 4, tokensIn: 100, tokensOut: 50, costCents: 42 },
  budget: { limitCents: 1000, remainingCents: 958, pct: 0.042 },
  byProvider: [],
  recentErrors: [
    {
      id: 'err-1',
      functionName: 'extract',
      httpMethod: 'POST',
      httpPath: '/api/extract',
      statusCode: 500,
      message: 'boom',
      createdAt: '2026-05-31T10:00:00Z',
    },
  ],
  status: 'ok',
  alerts: [],
  auth: {
    clerkConfigured: true,
    legacyFallbackAllowed: false,
    legacyOwnerMapped: true,
    mode: 'clerk',
  },
  operational: {
    requestId: 'rid-test',
    databaseReachable: true,
    runtimeApiRoutesContract: 'check:runtime-api-routes',
    productionSmokeCommand: 'npm run smoke:production-report',
    logRedaction: 'structured-redaction',
  },
  embeddings: { pendingEntities: 5, pendingQuotes: 6 },
  dailyCost: [],
}

describe('healthPanelModel', () => {
  it('construye diagnostico operativo con campos criticos', () => {
    expect(buildHealthDiagnostic(HEALTH)).toContain('auth=clerk')
    expect(buildHealthDiagnostic(HEALTH)).toContain('requestId=rid-test')
    expect(buildHealthDiagnostic(HEALTH)).toContain('latestError=extract 500 boom')
  })

  it('agrupa errores recientes y conserva el timestamp mas nuevo', () => {
    expect(
      dedupHealthErrors([
        {
          id: 'old',
          functionName: 'extract',
          statusCode: 500,
          message: 'boom',
          createdAt: '2026-05-31T10:00:00Z',
        },
        {
          id: 'new',
          functionName: 'extract',
          statusCode: 500,
          message: 'boom',
          createdAt: '2026-05-31T11:00:00Z',
        },
      ]),
    ).toEqual([
      {
        functionName: 'extract',
        statusCode: 500,
        message: 'boom',
        latestAt: '2026-05-31T11:00:00Z',
        count: 2,
      },
    ])
  })

  it('no fusiona errores con prefijo largo compartido si el mensaje completo difiere', () => {
    const sharedPrefix = 'x'.repeat(220)

    expect(
      dedupHealthErrors([
        {
          id: 'first',
          functionName: 'extract',
          statusCode: 500,
          message: `${sharedPrefix} A`,
          createdAt: '2026-05-31T10:00:00Z',
        },
        {
          id: 'second',
          functionName: 'extract',
          statusCode: 500,
          message: `${sharedPrefix} B`,
          createdAt: '2026-05-31T11:00:00Z',
        },
      ]),
    ).toHaveLength(2)
  })

  it('resuelve tono de presupuesto por umbrales', () => {
    expect(resolveBudgetTone(0.1).fg).toBe('var(--accent-sage)')
    expect(resolveBudgetTone(0.7).fg).toBe('var(--accent-gold)')
    expect(resolveBudgetTone(0.9).fg).toBe('rgb(185 28 28)')
  })
})
