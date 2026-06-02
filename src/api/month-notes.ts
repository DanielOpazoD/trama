import { request } from './request'

/** Nota global de un mes ('YYYY-MM'): texto libre al lado del navegador. */
export type MonthNote = {
  monthKey: string
  content: string
}

export const monthNotesApi = {
  async get(month: string): Promise<MonthNote> {
    return request<MonthNote>(`/api/month-notes?month=${encodeURIComponent(month)}`)
  },
  async save(month: string, content: string): Promise<MonthNote> {
    return request<MonthNote>('/api/month-notes', {
      method: 'PUT',
      body: JSON.stringify({ month, content }),
    })
  },
}
