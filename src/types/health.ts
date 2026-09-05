/**
 * Formas de la respuesta de observabilidad (health).
 *
 * Viven fuera de `src/api/health.ts` porque las necesitan dos lados a la vez:
 * el cliente que llama al endpoint y el router del modo prueba que lo imita.
 * Si el router las importara de `src/api/health`, se cerraría un ciclo
 * —`api/health` → `api/request` → `lib/demo` → `demoRouter`— que el gate de
 * arquitectura rechaza, y con razón: un módulo de tipos no debe arrastrar la
 * capa de red detrás.
 */

export type HealthAlert = {
  severity: 'info' | 'warn' | 'error'
  code: string
  label: string
  hint: string
}

export type HealthResponse = {
  counts: { entities: number; quotes: number; relationships: number }
  month: {
    calls: number
    tokensIn: number
    tokensOut: number
    costCents: number
  }
  budget: {
    limitCents: number
    remainingCents: number
    pct: number
  }
  auth: {
    clerkConfigured: boolean
    legacyFallbackAllowed: boolean
    legacyOwnerMapped: boolean
    mode: 'legacy-single-user' | 'clerk-with-legacy-fallback' | 'clerk'
  }
  operational: {
    requestId: string
    databaseReachable: boolean
    runtimeApiRoutesContract: 'check:runtime-api-routes'
    productionSmokeCommand: 'npm run smoke:production-report'
    legacyDataReassignmentCommand: 'npm run legacy-data-reassignment:dry-run -- --markdown'
    logRedaction: 'structured-redaction'
  }
  byProvider: Array<{
    provider: string
    model: string
    calls: number
    costCents: number
  }>
  recentErrors: Array<{
    id: string
    functionName: string
    httpMethod: string | null
    httpPath: string | null
    statusCode: number | null
    message: string
    createdAt: string
  }>
  /** Estado global derivado del peor severity de `alerts`. */
  status: 'ok' | 'degraded' | 'critical'
  alerts: HealthAlert[]
  embeddings: {
    pendingEntities: number
    pendingQuotes: number
  }
  /** Serie diaria de los últimos 30 días para sparklines. Días sin
      actividad aparecen con costCents=0, calls=0. */
  dailyCost: Array<{
    day: string
    costCents: number
    calls: number
  }>
  /** Core Web Vitals del usuario: p75 a 7 y 28 días con semáforo de Google.
      Siempre las tres métricas, en orden LCP · INP · CLS. */
  webVitals: WebVitalSummary[]
}

export type WebVitalSummary = {
  metric: 'LCP' | 'INP' | 'CLS'
  unit: 'ms' | 'score'
  p75: { d7: number | null; d28: number | null }
  samples: { d7: number; d28: number }
  rating: 'good' | 'needs-improvement' | 'poor' | 'no-data'
}
