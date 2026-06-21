import { request } from './request'
import type {
  BibliotecaListParams,
  BibliotecaListResult,
  LibraryFileType,
  LibraryItem,
  LibraryItemKind,
  LibrarySource,
  LibraryStorageDomain,
} from '../types/biblioteca'

/**
 * Fila snake_case tal cual la devuelve `GET /api/biblioteca`. El servidor reenvía
 * las filas del read-model sin transformar; acá las pasamos a la forma camelCase
 * pública (igual que notas-attachments).
 */
type LibraryItemRow = {
  item_kind: LibraryItemKind
  item_id: string
  title: string
  file_type: LibraryFileType
  source: LibrarySource
  mime_type: string | null
  byte_size: number | null
  storage_key: string | null
  storage_domain: LibraryStorageDomain
  tags: string[]
  pinned: boolean
  ai_status: string | null
  created_at: string
  updated_at: string
}

type BibliotecaListResponse = {
  items: LibraryItemRow[]
  nextCursor: string | null
}

function libraryItemFromRow(row: LibraryItemRow): LibraryItem {
  return {
    id: `${row.item_kind}:${row.item_id}`,
    kind: row.item_kind,
    itemId: row.item_id,
    title: row.title,
    fileType: row.file_type,
    source: row.source,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    storageKey: row.storage_key,
    storageDomain: row.storage_domain,
    tags: row.tags ?? [],
    pinned: row.pinned,
    aiStatus: row.ai_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildQuery(params: BibliotecaListParams): string {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.tab) search.set('tab', params.tab)
  if (params.tipo) search.set('tipo', params.tipo)
  if (params.fuente) search.set('fuente', params.fuente)
  if (params.orden) search.set('orden', params.orden)
  if (params.incluyeEliminados) search.set('incluyeEliminados', 'true')
  if (params.limit !== undefined) search.set('limit', String(params.limit))
  if (params.cursor) search.set('cursor', params.cursor)
  return search.toString()
}

export const bibliotecaApi = {
  async list(params: BibliotecaListParams = {}): Promise<BibliotecaListResult> {
    const query = buildQuery(params)
    const url = query ? `/api/biblioteca?${query}` : '/api/biblioteca'
    const response = await request<BibliotecaListResponse>(url)
    return {
      items: response.items.map(libraryItemFromRow),
      nextCursor: response.nextCursor,
    }
  },
}
