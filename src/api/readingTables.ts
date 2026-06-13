/**
 * Mesas / proyectos editoriales — cliente. Persisten la mesa de Flujo (título +
 * materiales elegidos + borrador Markdown + estado). Transforma snake→camel en
 * la frontera, como el resto de src/api.
 */
import { request } from './request'

export type ReadingTableStatus = 'borrador' | 'redactando' | 'revisando' | 'cerrado'

export type ReadingTable = {
  id: string
  title: string
  materialIds: string[]
  draftMarkdown: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export type ReadingTableRow = {
  id: string
  title: string
  material_ids: string[]
  draft_markdown: string | null
  status: string
  created_at: string
  updated_at: string
}

export function readingTableFromRow(r: ReadingTableRow): ReadingTable {
  return {
    id: r.id,
    title: r.title,
    materialIds: Array.isArray(r.material_ids) ? r.material_ids : [],
    draftMarkdown: r.draft_markdown,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export const readingTablesApi = {
  async listReadingTables(): Promise<ReadingTable[]> {
    const rows = await request<ReadingTableRow[]>('/api/reading-tables')
    return rows.map(readingTableFromRow)
  },
  async createReadingTable(input: {
    title: string
    materialIds?: string[]
    draftMarkdown?: string | null
  }): Promise<ReadingTable> {
    const row = await request<ReadingTableRow>('/api/reading-tables', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return readingTableFromRow(row)
  },
  async updateReadingTable(
    id: string,
    patch: {
      title?: string
      materialIds?: string[]
      draftMarkdown?: string | null
      status?: ReadingTableStatus
    },
  ): Promise<ReadingTable> {
    const row = await request<ReadingTableRow>(`/api/reading-tables/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    return readingTableFromRow(row)
  },
  async removeReadingTable(id: string): Promise<{ deletedAt: string | null }> {
    const res = await request<{ ok: boolean; deletedAt?: string | null }>(
      `/api/reading-tables/${id}`,
      { method: 'DELETE' },
    )
    return { deletedAt: res.deletedAt ?? null }
  },
  async restoreReadingTable(id: string, deletedAt: string): Promise<void> {
    await request<{ restored: boolean }>(`/api/reading-tables/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ deletedAt }),
    })
  },
}
