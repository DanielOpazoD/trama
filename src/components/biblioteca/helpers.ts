/**
 * Helpers puros de la Biblioteca — formato de tamaño/fecha y lógica de orden.
 * Sin React, fáciles de testear en aislamiento.
 */

import type { BibliotecaListParams, LibraryFileType } from '../../types/biblioteca'

/** El valor de `orden` que viaja a la URL y al backend. */
export type BibliotecaOrden = NonNullable<BibliotecaListParams['orden']>

/** Columnas ordenables de la lista. */
export type SortColumn = 'nombre' | 'modificado' | 'tamano'

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
