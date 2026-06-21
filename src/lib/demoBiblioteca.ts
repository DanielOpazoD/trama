/**
 * Backend liviano de la Biblioteca para el modo prueba.
 *
 * Devuelve filas en la MISMA forma snake_case que `GET /api/biblioteca`
 * (item_kind, item_id, …) para que el transform de `src/api/biblioteca.ts`
 * corra igual que con el backend real. Aplica los filtros que la vista usa en
 * PR2 (tab, q, orden) y pagina por offset (cursor numérico opaco), espejo de
 * `netlify/functions/_lib/library-read-model.ts`.
 *
 * Autocontenido a propósito: NO importa el `_lib` del backend (rompería la
 * frontera frontend↔backend). La lista sembrada vive acá.
 */

/** Fila snake_case tal cual la emite el endpoint (no se exporta el tipo del
 *  cliente para no cruzar la frontera; basta describirla inline). */
type LibraryItemRow = {
  item_kind: string
  item_id: string
  title: string
  file_type: string
  source: string
  mime_type: string | null
  byte_size: number | null
  storage_key: string | null
  storage_domain: string
  tags: string[]
  pinned: boolean
  ai_status: string | null
  created_at: string
  updated_at: string
}

const DEFAULT_LIMIT = 30

/** ISO de hace N días (a una hora fija para que el orden sea estable). */
function daysAgo(n: number): string {
  const d = new Date('2026-06-21T09:00:00.000Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString()
}

/**
 * ~12 items creíbles que cubren los file_types (pdf, image, document,
 * spreadsheet, presentation, other) y las fuentes (subido, generado,
 * capturado, whatsapp), con fechas y tamaños variados; algunas imágenes
 * capturadas sin tamaño (byte_size null), como en producción.
 */
const SEED: LibraryItemRow[] = [
  {
    item_kind: 'pdf-saved',
    item_id: 'demo-pdf-1',
    title: 'Borges — Ficciones (anotado).pdf',
    file_type: 'pdf',
    source: 'generado',
    mime_type: 'application/pdf',
    byte_size: 2_415_919,
    storage_key: 'legacy-single-user/demo-pdf-1',
    storage_domain: 'pdf-studio-saved-pdfs',
    tags: ['lectura'],
    pinned: true,
    ai_status: null,
    created_at: daysAgo(2),
    updated_at: daysAgo(1),
  },
  {
    item_kind: 'notas-attachment',
    item_id: 'demo-att-1',
    title: 'Contrato de edición.pdf',
    file_type: 'pdf',
    source: 'subido',
    mime_type: 'application/pdf',
    byte_size: 845_201,
    storage_key: 'legacy-single-user/demo-att-1',
    storage_domain: 'notas-attachments',
    tags: [],
    pinned: false,
    ai_status: null,
    created_at: daysAgo(9),
    updated_at: daysAgo(4),
  },
  {
    item_kind: 'recorte-image',
    item_id: 'demo-img-1',
    title: 'Recorte · entrevista a Pizarnik',
    file_type: 'image',
    source: 'capturado',
    mime_type: 'image/png',
    byte_size: null,
    // PR3: key con extensión `.svg` para que demoMedia sirva un placeholder y
    // la miniatura se vea en modo prueba (el sufijo `-N` varía la paleta).
    storage_key: 'demo/foto-1.svg',
    storage_domain: 'recortes-media',
    tags: ['poesía'],
    pinned: false,
    ai_status: null,
    created_at: daysAgo(3),
    updated_at: daysAgo(3),
  },
  {
    item_kind: 'momento-foto',
    item_id: 'demo-img-2',
    title: 'Foto · feria del libro',
    file_type: 'image',
    source: 'whatsapp',
    mime_type: 'image/jpeg',
    byte_size: 3_882_106,
    storage_key: 'demo/foto-2.svg',
    storage_domain: 'momentos-media',
    tags: [],
    pinned: false,
    ai_status: null,
    created_at: daysAgo(6),
    updated_at: daysAgo(6),
  },
  {
    item_kind: 'momento-foto',
    item_id: 'demo-img-3',
    title: 'Foto · biblioteca de casa',
    file_type: 'image',
    source: 'capturado',
    mime_type: 'image/heic',
    byte_size: null,
    storage_key: 'demo/foto-3.svg',
    storage_domain: 'momentos-media',
    tags: [],
    pinned: false,
    ai_status: null,
    created_at: daysAgo(11),
    updated_at: daysAgo(11),
  },
  {
    item_kind: 'notas-attachment',
    item_id: 'demo-doc-1',
    title: 'Notas del seminario.docx',
    file_type: 'document',
    source: 'subido',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    byte_size: 56_320,
    storage_key: 'legacy-single-user/demo-doc-1',
    storage_domain: 'notas-attachments',
    tags: ['apuntes'],
    pinned: false,
    ai_status: null,
    created_at: daysAgo(1),
    updated_at: daysAgo(0),
  },
  {
    item_kind: 'notas-attachment',
    item_id: 'demo-doc-2',
    title: 'Borrador de ensayo.md',
    file_type: 'document',
    source: 'generado',
    mime_type: 'text/markdown',
    byte_size: 12_044,
    storage_key: 'legacy-single-user/demo-doc-2',
    storage_domain: 'notas-attachments',
    tags: [],
    pinned: false,
    ai_status: 'listo',
    created_at: daysAgo(5),
    updated_at: daysAgo(2),
  },
  {
    item_kind: 'notas-attachment',
    item_id: 'demo-sheet-1',
    title: 'Presupuesto editorial.xlsx',
    file_type: 'spreadsheet',
    source: 'subido',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byte_size: 38_911,
    storage_key: 'legacy-single-user/demo-sheet-1',
    storage_domain: 'notas-attachments',
    tags: ['gestión'],
    pinned: false,
    ai_status: null,
    created_at: daysAgo(14),
    updated_at: daysAgo(7),
  },
  {
    item_kind: 'notas-attachment',
    item_id: 'demo-slides-1',
    title: 'Charla · el oficio de leer.pptx',
    file_type: 'presentation',
    source: 'subido',
    mime_type:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    byte_size: 6_215_004,
    storage_key: 'legacy-single-user/demo-slides-1',
    storage_domain: 'notas-attachments',
    tags: [],
    pinned: false,
    ai_status: null,
    created_at: daysAgo(20),
    updated_at: daysAgo(12),
  },
  {
    item_kind: 'notas-attachment',
    item_id: 'demo-other-1',
    title: 'export-trama.json',
    file_type: 'other',
    source: 'generado',
    mime_type: 'application/json',
    byte_size: 102_400,
    storage_key: 'legacy-single-user/demo-other-1',
    storage_domain: 'notas-attachments',
    tags: ['backup'],
    pinned: false,
    ai_status: null,
    created_at: daysAgo(8),
    updated_at: daysAgo(8),
  },
  {
    item_kind: 'recorte-image',
    item_id: 'demo-img-4',
    title: 'Recorte · mapa de Macondo',
    file_type: 'image',
    source: 'whatsapp',
    mime_type: 'image/webp',
    byte_size: 489_233,
    storage_key: 'demo/foto-1.svg',
    storage_domain: 'recortes-media',
    tags: ['referencia'],
    pinned: false,
    ai_status: null,
    created_at: daysAgo(16),
    updated_at: daysAgo(15),
  },
  {
    item_kind: 'pdf-stamp',
    item_id: 'demo-other-2',
    title: 'Firma escaneada',
    file_type: 'other',
    source: 'generado',
    mime_type: 'image/svg+xml',
    byte_size: 4_096,
    storage_key: 'legacy-single-user/demo-other-2',
    storage_domain: 'pdf-stamp-assets',
    tags: [],
    pinned: false,
    ai_status: null,
    created_at: daysAgo(30),
    updated_at: daysAgo(22),
  },
]

/** Normaliza para comparar títulos sin distinguir mayúsculas/acentos. */
function foldTitle(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function compareUpdatedAt(a: LibraryItemRow, b: LibraryItemRow): number {
  if (a.updated_at === b.updated_at) return 0
  return a.updated_at < b.updated_at ? -1 : 1
}

function compareTitle(a: LibraryItemRow, b: LibraryItemRow): number {
  return foldTitle(a.title).localeCompare(foldTitle(b.title))
}

/** Ordena por tamaño con nulls SIEMPRE al final (en ambas direcciones). */
function compareByteSizeDirected(
  a: LibraryItemRow,
  b: LibraryItemRow,
  dir: 1 | -1,
): number {
  const an = a.byte_size
  const bn = b.byte_size
  if (an === null && bn === null) return 0
  if (an === null) return 1
  if (bn === null) return -1
  if (an === bn) return 0
  return (an < bn ? -1 : 1) * dir
}

/**
 * Maneja una "request" GET /api/biblioteca contra la lista sembrada.
 * Devuelve `{ items, nextCursor }` en forma snake_case.
 */
export function routeDemoBiblioteca(params: URLSearchParams): {
  items: LibraryItemRow[]
  nextCursor: string | null
} {
  const tab = params.get('tab') ?? 'todo'
  const q = foldTitle((params.get('q') ?? '').trim())
  const orden = params.get('orden') ?? 'modificado-desc'
  // Popover (PR3): filtros por familia de archivo y por fuente. '' = sin filtro,
  // igual que el backend (`file_type = tipo` / `source = fuente`).
  const tipo = params.get('tipo') ?? ''
  const fuente = params.get('fuente') ?? ''
  // Clamp a 1..100 como el contrato del backend: un limit negativo o enorme
  // rompería el slicing y podría generar un nextCursor negativo.
  const parsedLimit = Number.parseInt(params.get('limit') ?? '', 10)
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(100, Math.max(1, parsedLimit))
    : DEFAULT_LIMIT
  const cursorRaw = Number.parseInt(params.get('cursor') ?? '0', 10)
  const offset = Number.isFinite(cursorRaw) && cursorRaw > 0 ? cursorRaw : 0

  // Filtro por pestaña: imagenes → solo image; archivos → todo menos image.
  let rows = SEED.filter((row) => {
    if (tab === 'imagenes') return row.file_type === 'image'
    if (tab === 'archivos') return row.file_type !== 'image'
    return true
  })

  // Búsqueda por título (substring, sin distinguir mayúsculas/acentos).
  if (q) rows = rows.filter((row) => foldTitle(row.title).includes(q))

  // Filtros del popover (espejo del WHERE del read-model).
  if (tipo) rows = rows.filter((row) => row.file_type === tipo)
  if (fuente) rows = rows.filter((row) => row.source === fuente)

  // Orden + desempate estable por item_id (igual que el backend).
  const sorted = [...rows].sort((a, b) => {
    let primary = 0
    switch (orden) {
      case 'modificado-asc':
        primary = compareUpdatedAt(a, b)
        break
      case 'nombre-asc':
        primary = compareTitle(a, b)
        break
      case 'nombre-desc':
        primary = -compareTitle(a, b)
        break
      case 'tamano-desc':
        primary = compareByteSizeDirected(a, b, -1)
        break
      case 'tamano-asc':
        primary = compareByteSizeDirected(a, b, 1)
        break
      case 'modificado-desc':
      default:
        primary = -compareUpdatedAt(a, b)
        break
    }
    if (primary !== 0) return primary
    return a.item_id.localeCompare(b.item_id)
  })

  const total = sorted.length
  const start = Math.min(offset, total)
  const items = sorted.slice(start, start + limit)
  const nextCursor = start + limit < total ? String(start + limit) : null
  return { items, nextCursor }
}
