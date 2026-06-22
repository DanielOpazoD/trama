import { request, requestBlob } from './request'
import type {
  BibliotecaListParams,
  BibliotecaListResult,
  LibraryFileType,
  LibraryItem,
  LibraryItemKind,
  LibraryItemLink,
  LibraryLinkTargetKind,
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
  if (params.tag) search.set('tag', params.tag)
  if (params.orden) search.set('orden', params.orden)
  if (params.incluyeEliminados) search.set('incluyeEliminados', 'true')
  if (params.limit !== undefined) search.set('limit', String(params.limit))
  if (params.cursor) search.set('cursor', params.cursor)
  return search.toString()
}

/**
 * Endpoint de servir-blob por dominio de storage. Los tres comparten la forma
 * `/api/<x>/:key` (autorizan internamente y devuelven el blob). Los dominios de
 * PDF (`pdf-studio-saved-pdfs`, `pdf-stamp-assets`) no tienen miniatura todavía
 * → `null` (la card cae al ícono de tipo). En modo prueba `demoMedia` sirve un
 * placeholder para cualquier key de estos tres endpoints.
 */
const SERVE_ENDPOINT: Partial<Record<LibraryStorageDomain, string>> = {
  'library-uploads': '/api/library-uploads-file',
  'notas-attachments': '/api/notas-attachments-file',
  'momentos-media': '/api/momentos-file',
  'recortes-media': '/api/recortes-image',
}

/**
 * Codifica una `storageKey` para usarla en la URL. Las keys suelen tener forma
 * `userId/hash.ext`: codificamos cada segmento por separado para preservar las
 * barras (un `encodeURIComponent` de la key entera las escaparía a `%2F`).
 */
function encodeStorageKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

/**
 * URL para servir el blob de un item (miniatura o vista). `null` cuando no hay
 * forma de servirlo: sin `storageKey`, o dominio sin endpoint de miniatura
 * (los PDFs por ahora). El consumidor decide el fallback (ícono de tipo).
 */
export function libraryItemServeUrl(item: LibraryItem): string | null {
  if (!item.storageKey) return null
  const endpoint = SERVE_ENDPOINT[item.storageDomain]
  if (!endpoint) return null
  return `${endpoint}/${encodeStorageKey(item.storageKey)}`
}

/**
 * ¿Se puede descargar este item? Solo si tiene una URL de servir (los dominios
 * sin endpoint de blob — pdf-studio, pdf-stamp data-url — no son descargables y
 * la UI oculta la acción). El download reusa esa misma URL autenticada.
 */
export function canDownloadLibraryItem(item: LibraryItem): boolean {
  return libraryItemServeUrl(item) !== null
}

/** Path del endpoint de acciones, con kind/id codificados para la URL. */
function libraryItemPath(kind: LibraryItemKind, itemId: string): string {
  return `/api/biblioteca-item/${encodeURIComponent(kind)}/${encodeURIComponent(itemId)}`
}

/** Path del endpoint de conexiones, con kind/id codificados para la URL. */
function libraryLinksPath(kind: LibraryItemKind, itemId: string): string {
  return `/api/biblioteca-links/${encodeURIComponent(kind)}/${encodeURIComponent(itemId)}`
}

/**
 * Dispara la descarga de un blob en el navegador como `filename`. Crea un
 * object-url efímero y un <a download> sintético; lo revoca tras el click.
 */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revocar en el próximo tick: algunos navegadores cancelan la descarga si la
  // URL se revoca de forma síncrona justo después del click.
  setTimeout(() => URL.revokeObjectURL(url), 0)
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

  /**
   * Sube uno o varios archivos directo a la Biblioteca (multipart). Cada entrada
   * lleva el `File` y, opcional, su `takenAt` (ISO de la fecha de captura —
   * EXIF/lastModified, resuelta en el cliente) que el servidor ancla en
   * `created_at`. Devuelve los items creados (ya en forma camelCase, listos para
   * insertar en la lista). `POST /api/library-uploads`.
   */
  async upload(
    files: { file: File; takenAt?: string }[],
  ): Promise<{ items: LibraryItem[]; failed: { name: string; message: string }[] }> {
    const items: LibraryItem[] = []
    const failed: { name: string; message: string }[] = []
    // UNA request POR archivo: las funciones de Netlify topean el tamaño del
    // body (~6 MB), así que mandar varias fotos juntas se pasa de largo y falla
    // (500). Secuencial: cada request es chica, un fallo no tumba al resto y
    // reportamos el motivo por archivo. El endpoint igual acepta varios.
    for (const { file, takenAt } of files) {
      try {
        const form = new FormData()
        form.append('file', file)
        form.append('takenAt', takenAt ?? '')
        const res = await request<{
          items: LibraryItem[]
          failed?: { name: string; message: string }[]
        }>('/api/library-uploads', { method: 'POST', body: form })
        items.push(...res.items)
        if (res.failed) failed.push(...res.failed)
      } catch (err) {
        failed.push({
          name: file.name,
          message: err instanceof Error ? err.message : 'No se pudo subir',
        })
      }
    }
    return { items, failed }
  },

  /** Renombra un item (upsert de display_title en el override). */
  async rename(
    kind: LibraryItemKind,
    itemId: string,
    displayTitle: string,
  ): Promise<void> {
    await request(libraryItemPath(kind, itemId), {
      method: 'PATCH',
      body: JSON.stringify({ displayTitle }),
    })
  },

  /** Manda a la papelera (deleted=true) o restaura (deleted=false). */
  async setDeleted(
    kind: LibraryItemKind,
    itemId: string,
    deleted: boolean,
  ): Promise<void> {
    await request(libraryItemPath(kind, itemId), {
      method: 'PATCH',
      body: JSON.stringify({ deleted }),
    })
  },

  /** Reemplaza las etiquetas del item (upsert de tags en el override). */
  async setTags(kind: LibraryItemKind, itemId: string, tags: string[]): Promise<void> {
    await request(libraryItemPath(kind, itemId), {
      method: 'PATCH',
      body: JSON.stringify({ tags }),
    })
  },

  /** Fija (pinned=true) o suelta (pinned=false) el item. */
  async setPinned(kind: LibraryItemKind, itemId: string, pinned: boolean): Promise<void> {
    await request(libraryItemPath(kind, itemId), {
      method: 'PATCH',
      body: JSON.stringify({ pinned }),
    })
  },

  /** Lista las conexiones del item ("aparece en"), con título del destino. */
  async listLinks(kind: LibraryItemKind, itemId: string): Promise<LibraryItemLink[]> {
    const res = await request<{ links: LibraryItemLink[] }>(
      libraryLinksPath(kind, itemId),
    )
    return res.links
  },

  /** Crea (o revive) un vínculo del item a un destino (entidad/nota/momento). */
  async addLink(
    kind: LibraryItemKind,
    itemId: string,
    targetKind: LibraryLinkTargetKind,
    targetId: string,
  ): Promise<void> {
    await request(libraryLinksPath(kind, itemId), {
      method: 'POST',
      body: JSON.stringify({ targetKind, targetId }),
    })
  },

  /** Quita un vínculo del item (soft-delete; destino vía query params). */
  async removeLink(
    kind: LibraryItemKind,
    itemId: string,
    targetKind: LibraryLinkTargetKind,
    targetId: string,
  ): Promise<void> {
    const qs = new URLSearchParams({ targetKind, targetId }).toString()
    await request(`${libraryLinksPath(kind, itemId)}?${qs}`, { method: 'DELETE' })
  },

  /**
   * Descarga el blob del item (fetch autenticado de su URL de servir) y lo
   * guarda con el nombre del item. Lanza si el item no es descargable (sin URL).
   */
  async download(item: LibraryItem): Promise<void> {
    const url = libraryItemServeUrl(item)
    if (!url) throw new Error('Este archivo no se puede descargar')
    const blob = await requestBlob(url)
    triggerBlobDownload(blob, item.title)
  },
}
