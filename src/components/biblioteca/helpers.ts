/**
 * Helpers puros de la Biblioteca — formato de tamaño/fecha y lógica de orden.
 * Sin React, fáciles de testear en aislamiento.
 */

import type {
  BibliotecaListParams,
  LibraryFileType,
  LibraryItem,
} from '../../types/biblioteca'

/** El valor de `orden` que viaja a la URL y al backend. */
export type BibliotecaOrden = NonNullable<BibliotecaListParams['orden']>

/** Columnas ordenables de la lista. */
export type SortColumn = 'nombre' | 'modificado' | 'creado' | 'tamano'

/** Dirección de orden derivada. */
export type SortDirection = 'asc' | 'desc'

/** Orden por defecto de la vista (lo más reciente arriba). */
export const DEFAULT_ORDEN: BibliotecaOrden = 'modificado-desc'

/** Modo de presentación de la lista de archivos. */
export type BibliotecaVista = 'lista' | 'cuadricula'

/** Vista por defecto (la lista, el hilo unificado). */
export const DEFAULT_VISTA: BibliotecaVista = 'lista'

/** Normaliza el query param `vista` a un valor válido (default `lista`). */
export function coerceVista(raw: string | null): BibliotecaVista {
  return raw === 'cuadricula' ? 'cuadricula' : DEFAULT_VISTA
}

/** Descompone un `orden` en columna + dirección. */
export function parseOrden(orden: BibliotecaOrden): {
  column: SortColumn
  direction: SortDirection
} {
  const [column, direction] = orden.split('-') as [SortColumn, SortDirection]
  return { column, direction }
}

/**
 * Dado el orden actual y la columna que se clickeó, devuelve el siguiente
 * `orden`. Si se clickea la columna activa, alterna asc↔desc. Si se clickea
 * otra columna, arranca en su dirección "natural": nombre asc (A→Z),
 * modificado/tamaño desc (más reciente / más grande primero).
 */
export function toggleOrden(
  current: BibliotecaOrden,
  column: SortColumn,
): BibliotecaOrden {
  const { column: activeColumn, direction } = parseOrden(current)
  if (activeColumn === column) {
    const next: SortDirection = direction === 'asc' ? 'desc' : 'asc'
    return `${column}-${next}` as BibliotecaOrden
  }
  // Dirección "natural" al estrenar una columna: nombre A→Z; fechas y tamaño
  // arrancan descendentes (lo más reciente / lo más grande primero).
  const naturalDirection: SortDirection = column === 'nombre' ? 'asc' : 'desc'
  return `${column}-${naturalDirection}` as BibliotecaOrden
}

/**
 * Tamaño de archivo legible. `null` → '—' (las imágenes capturadas a veces no
 * traen tamaño). Usa KB/MB con un decimal en MB, igual de sobrio que el resto
 * de la metadata.
 */
export function formatByteSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

/** Etiqueta legible de la familia de archivo, para la metadata de las cards. */
const FILE_TYPE_LABELS: Record<LibraryFileType, string> = {
  image: 'Imagen',
  document: 'Documento',
  spreadsheet: 'Hoja de cálculo',
  presentation: 'Presentación',
  pdf: 'PDF',
  audio: 'Audio',
  video: 'Video',
  other: 'Archivo',
}

export function fileTypeLabel(fileType: LibraryFileType): string {
  return FILE_TYPE_LABELS[fileType] ?? FILE_TYPE_LABELS.other
}

/** Etiqueta legible de la fuente del archivo, para la metadata del visor. */
const SOURCE_LABELS: Record<LibraryItem['source'], string> = {
  subido: 'Subido',
  generado: 'Generado',
  capturado: 'Capturado',
  whatsapp: 'WhatsApp',
}

export function sourceLabel(source: LibraryItem['source']): string {
  return SOURCE_LABELS[source] ?? source
}

/**
 * Metadata de pie de card: etiqueta de tipo + tamaño separados por un punto
 * medio ("PDF · 164 KB"). Si no hay tamaño, solo la etiqueta (no "PDF · —").
 */
export function formatCardMeta(fileType: LibraryFileType, bytes: number | null): string {
  const label = fileTypeLabel(fileType)
  if (bytes === null || bytes === undefined) return label
  return `${label} · ${formatByteSize(bytes)}`
}

/**
 * Fecha corta en español: "19 jun". Si la fecha es inválida, devuelve ''.
 */
export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

/**
 * Extrae la extensión de un nombre de archivo (con el punto, p. ej. `.pdf`), o
 * '' si no tiene una "de verdad". Reglas conservadoras para no inventar
 * extensiones donde no las hay:
 *   - el punto no puede ser el primero (`.gitignore` no tiene extensión)
 *   - debe haber algo antes del punto
 *   - 1..8 caracteres alfanuméricos tras el último punto
 */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  const ext = name.slice(dot + 1)
  return /^[A-Za-z0-9]{1,8}$/.test(ext) ? name.slice(dot) : ''
}

/**
 * Resuelve el nombre final al renombrar, preservando la extensión del original
 * si el usuario la quitó. Ej.: original `a.pdf`, escrito `b` → `b.pdf`. Si el
 * usuario tipeó SU propia extensión (la misma u otra) se respeta tal cual.
 * Recorta espacios; devuelve '' si el nombre queda vacío (el caller valida).
 */
export function resolveRenamedTitle(original: string, typed: string): string {
  const trimmed = typed.trim()
  if (!trimmed) return ''
  const originalExt = fileExtension(original)
  if (!originalExt) return trimmed
  // Si ya termina con la extensión original (sin distinguir mayúsculas), o si el
  // usuario escribió otra extensión propia, no tocamos nada.
  if (trimmed.toLowerCase().endsWith(originalExt.toLowerCase())) return trimmed
  if (fileExtension(trimmed)) return trimmed
  return `${trimmed}${originalExt}`
}

/**
 * Extensión en MAYÚSCULAS para la columna de la lista (`PDF`, `DOCX`), sin el
 * punto. Si el nombre no trae una extensión "de verdad" (ver `fileExtension`),
 * cae a la etiqueta de la familia de archivo (`PDF`, `Imagen`, …) para no dejar
 * la celda vacía. Puro: lo testeamos en aislamiento.
 */
export function fileExtensionLabel(item: {
  title: string
  fileType: LibraryFileType
}): string {
  const ext = fileExtension(item.title)
  if (ext) return ext.slice(1).toUpperCase()
  return fileTypeLabel(item.fileType)
}

/**
 * Modo de visor para un item: qué superficie abrir al hacer clic.
 *
 *   - `image`  → lightbox de imagen (object-URL autenticado).
 *   - `pdf`    → visor pdf.js paginado (lazy).
 *   - `office` → Word (.docx) / Excel (.xlsx/.xls) renderizados a HTML por un
 *                visor lazy (mammoth / xlsx). NO incluye .doc/.ppt/.pptx, que no
 *                tienen un convertidor liviano en el navegador.
 *   - `text`   → panel de texto/markdown/JSON (se baja el blob como texto).
 *   - `none`   → sin previsualización posible (.doc/.ppt/.pptx, audio, etc.):
 *                solo metadata + CTA de descarga.
 *
 * La decisión combina `fileType` (derivado del mime en el servidor) con el mime
 * y la extensión, porque algunos archivos de texto/JSON llegan con `fileType`
 * 'document' u 'other'. Puro y testeable: la UI solo enruta.
 */
export type ViewerMode = 'image' | 'pdf' | 'office' | 'text' | 'video' | 'none'

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'json', 'csv', 'log'])

/** Qué familia de Office previsualizable es un item (o `null` si ninguna). */
export type OfficeKind = 'docx' | 'xlsx'

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const XLS_MIME = 'application/vnd.ms-excel'

/**
 * Detecta si un item es un documento de Office previsualizable y de qué tipo.
 * Solo cubre lo que un convertidor liviano del navegador sabe abrir:
 *   - `docx` → Word moderno (mammoth convierte .docx, NO .doc).
 *   - `xlsx` → Excel moderno y el binario legacy .xls (xlsx lee ambos).
 * `.doc`, `.ppt` y `.pptx` quedan fuera (→ `null`): no hay render confiable.
 *
 * Mira el mime normalizado primero y la extensión como respaldo (algunos
 * archivos llegan con un mime genérico). Compartido por `viewerModeFor` y el
 * visor para que ambos coincidan en la elección de librería.
 */
export function officeKindFor(item: {
  title: string
  mimeType: string | null
}): OfficeKind | null {
  // Normaliza el mime (sin parámetros tipo `; charset=utf-8`).
  const baseMime = item.mimeType?.toLowerCase().split(';', 1)[0]?.trim() ?? ''
  const ext = fileExtension(item.title).slice(1).toLowerCase()

  if (baseMime === DOCX_MIME || ext === 'docx') return 'docx'
  if (
    baseMime === XLSX_MIME ||
    baseMime === XLS_MIME ||
    ext === 'xlsx' ||
    ext === 'xls'
  ) {
    return 'xlsx'
  }
  return null
}

export function viewerModeFor(item: {
  title: string
  fileType: LibraryFileType
  mimeType: string | null
}): ViewerMode {
  if (item.fileType === 'image') return 'image'
  if (item.fileType === 'pdf') return 'pdf'
  if (item.fileType === 'video') return 'video'

  // Office previsualizable (.docx / .xlsx / .xls) ANTES del chequeo de texto:
  // sus mimes no son de texto, pero queremos el visor rico, no el de descarga.
  if (officeKindFor(item)) return 'office'

  // Normaliza el mime (sin parámetros tipo `; charset=utf-8`).
  const baseMime = item.mimeType?.toLowerCase().split(';', 1)[0]?.trim() ?? ''
  const isTextMime =
    baseMime.startsWith('text/') ||
    baseMime === 'application/json' ||
    baseMime.endsWith('+json') ||
    baseMime === 'application/xml' ||
    baseMime.endsWith('+xml')

  const ext = fileExtension(item.title).slice(1).toLowerCase()
  const isTextExt = TEXT_EXTENSIONS.has(ext)

  if (isTextMime || isTextExt) return 'text'

  // .doc/.ppt/.pptx, audio, binarios → sin previsualización en navegador para
  // archivos privados (mammoth no abre .doc; no hay visor liviano de slides).
  return 'none'
}
