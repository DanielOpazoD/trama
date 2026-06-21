/**
 * Tipos públicos de la Biblioteca (frontera camelCase).
 *
 * La Biblioteca es un read-model: UNE las fuentes de archivos que ya existen
 * (adjuntos de notas, imágenes de recortes, fotos de momentos, PDFs guardados,
 * firmas) y les añade metadata propia vía `library_item_overrides`. Estos tipos
 * describen lo que el cliente consume; el servidor proyecta filas snake_case que
 * `src/api/biblioteca.ts` transforma a esta forma.
 *
 * En PR1 NO se construyen URLs de servir/miniatura (eso es PR3): cada item lleva
 * `storageKey` + `storageDomain` para que PR3 pueda armarlas.
 */

/** Discriminador de la fuente nativa del item. */
export type LibraryItemKind =
  | 'notas-attachment'
  | 'recorte-image'
  | 'momento-foto'
  | 'pdf-saved'
  | 'pdf-stamp'

/** Familia del archivo, derivada del mime en el servidor. */
export type LibraryFileType =
  | 'image'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'other'

/** De dónde vino el archivo, derivada de `kind` + `origin`/`source`. */
export type LibrarySource = 'subido' | 'generado' | 'capturado' | 'whatsapp'

/** Dominio de blobs donde vive el archivo (para construir URLs en PR3). */
export type LibraryStorageDomain =
  | 'notas-attachments'
  | 'recortes-media'
  | 'momentos-media'
  | 'pdf-studio-saved-pdfs'
  | 'pdf-stamp-assets'

export type LibraryItem = {
  /** Clave compuesta `${kind}:${itemId}` — estable para keys de React. */
  id: string
  kind: LibraryItemKind
  itemId: string
  title: string
  fileType: LibraryFileType
  source: LibrarySource
  mimeType: string | null
  byteSize: number | null
  storageKey: string | null
  storageDomain: LibraryStorageDomain
  tags: string[]
  pinned: boolean
  aiStatus: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Pestañas de la vista (filtra por familia de archivo). Fuente única del tipo:
 * lo consumen `BibliotecaListParams` (contrato de la API) y la UI
 * (`BibliotecaTabs`, `BibliotecaView`), evitando declaraciones duplicadas.
 */
export type BibliotecaTab = 'todo' | 'imagenes' | 'archivos'

/** Orden disponible (Modificado / Nombre / Tamaño, asc/desc). */
type BibliotecaOrden =
  | 'modificado-desc'
  | 'modificado-asc'
  | 'nombre-asc'
  | 'nombre-desc'
  | 'tamano-desc'
  | 'tamano-asc'

export type BibliotecaListParams = {
  /** Búsqueda por título (ILIKE). */
  q?: string
  tab?: BibliotecaTab
  /** Filtro por familia de archivo; '' o ausente = sin filtro. */
  tipo?: LibraryFileType | ''
  /** Filtro por fuente; '' o ausente = sin filtro. */
  fuente?: LibrarySource | ''
  orden?: BibliotecaOrden
  /** Incluir items ocultos a nivel Biblioteca (papelera). */
  incluyeEliminados?: boolean
  /** Cursor opaco (offset numérico codificado como string). */
  cursor?: string
  /** Tamaño de página (1–100, default 30). */
  limit?: number
}

export type BibliotecaListResult = {
  items: LibraryItem[]
  nextCursor: string | null
}
