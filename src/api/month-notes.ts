import { request } from './request'
import type { TaskCategory } from './tasks'

/**
 * Nota global de un mes ('YYYY-MM'), por categoría (Trabajo / Personal): texto
 * libre al lado del navegador de meses, igual que las tareas se dividen por
 * categoría.
 */
export type MonthNote = {
  monthKey: string
  category: TaskCategory
  content: string
}

export const monthNotesApi = {
  async get(month: string, category: TaskCategory): Promise<MonthNote> {
    const qs = `month=${encodeURIComponent(month)}&category=${category}`
    return request<MonthNote>(`/api/month-notes?${qs}`)
  },
  async save(month: string, category: TaskCategory, content: string): Promise<MonthNote> {
    return request<MonthNote>('/api/month-notes', {
      method: 'PUT',
      body: JSON.stringify({ month, category, content }),
    })
  },
}
