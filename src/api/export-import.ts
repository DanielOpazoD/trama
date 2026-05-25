/**
 * Export/Import del JSON completo de la trama.
 *
 * `importAll` devuelve `ImportResult` con `{ imported, skipped, failed[] }`
 * (post BB1) — los fallos per-item están listados, no silenciados.
 */

import type { ExportPayload, ImportResult } from '../types'
import { request } from './request'

export const exportImportApi = {
  async exportAll(): Promise<ExportPayload> {
    return request<ExportPayload>('/api/export')
  },

  async importAll(payload: ExportPayload): Promise<ImportResult> {
    return request<ImportResult>('/api/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
}
