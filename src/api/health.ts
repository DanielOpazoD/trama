/**
 * Health, counts, extraction-log, error-log — todos los endpoints de
 * observabilidad que se muestran en Settings.
 */

import { request } from './request'

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
}

export type ExtractionLogEntry = {
  id: string
  inputText: string
  proposal: unknown
  provider: string
  model: string
  tokensIn: number
  tokensOut: number
  costCents: number
  durationMs: number
  error: string | null
  createdAt: string
}

export type ExtractionLogResponse = {
  entries: ExtractionLogEntry[]
  totals: {
    totalCalls: number
    totalCostCents: number
    totalTokens: number
  }
}

export type ErrorLogEntry = {
  id: string
  functionName: string
  httpMethod: string | null
  httpPath: string | null
  statusCode: number | null
  message: string
  stack: string | null
  context: unknown
  createdAt: string
}

export const healthApi = {
  async getCounts(): Promise<{ entities: number; quotes: number; relationships: number; momentos: number }> {
    return request('/api/counts')
  },
  async getHealth(): Promise<HealthResponse> {
    return request<HealthResponse>('/api/health')
  },
  async extractionLog(limit = 50): Promise<ExtractionLogResponse> {
    return request<ExtractionLogResponse>(`/api/extraction-log?limit=${limit}`)
  },
  async errorLog(limit = 100): Promise<ErrorLogEntry[]> {
    return request<ErrorLogEntry[]>(`/api/error-log?limit=${limit}`)
  },
}
