/**
 * Configuración por tarea IA: provider + modelo opcional + verifyWith opcional.
 *
 * La fuente de verdad vive en la tabla `ai_task_providers`. El defaultProvider
 * (env `AI_PROVIDER`) es el fallback cuando una task no tiene override.
 */

import { request } from './request'

export type AITaskKey =
  | 'extract'
  | 'extract-image'
  | 'suggest-relationships'
  | 'reclassify'
  | 'reflect'
  | 'chat'
  | 'panel'

export type AITaskConfig = {
  task: AITaskKey
  /** null = use default (env var) */
  provider: string | null
  /** null = use provider's default model */
  model: string | null
  /** null = no cross-verification */
  verifyWith: string | null
  updatedAt: string | null
}

export type AISettingsResponse = {
  defaultProvider: string
  visionDefaultProvider: string | null
  tasks: AITaskConfig[]
}

export const aiSettingsApi = {
  async getAISettings(): Promise<AISettingsResponse> {
    return request<AISettingsResponse>('/api/ai-settings')
  },
  async setAITaskProvider(
    task: string,
    provider: string,
    model?: string | null,
    verifyWith?: string | null,
  ): Promise<void> {
    await request<void>('/api/ai-settings', {
      method: 'PUT',
      body: JSON.stringify({ task, provider, model, verifyWith }),
    })
  },
}
