/**
 * U-4: Cliente API para Crónicas (ensayos mensuales generados por IA).
 *
 * Endpoints:
 *   GET  /api/cronicas             → lista
 *   POST /api/cronicas/generate    → genera para (year, month)
 */
import { request } from './request'

export type Cronica = {
  id: string
  year: number
  month: number
  text: string
  sourceEntityIds: string[]
  generatedAt: string
  provider: string | null
  model: string | null
}

export type GeneratedCronica = Cronica & { alreadyExisted: boolean }

export const cronicasApi = {
  async list(): Promise<Cronica[]> {
    return request('/api/cronicas')
  },
  async generate(year: number, month: number): Promise<GeneratedCronica> {
    return request('/api/cronicas/generate', {
      method: 'POST',
      body: JSON.stringify({ year, month }),
    })
  },
}
