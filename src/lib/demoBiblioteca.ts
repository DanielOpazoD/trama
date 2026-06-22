/**
 * Backend liviano de la Biblioteca para el modo prueba.
 *
 * Devuelve filas en la MISMA forma snake_case que `GET /api/biblioteca`
 * (item_kind, item_id, …) para que el transform de `src/api/biblioteca.ts`
 * corra igual que con el backend real. Aplica los filtros que la vista usa
 * (tab, q, orden, tipo, fuente, incluyeEliminados) y pagina por offset (cursor
 * numérico opaco), espejo de `netlify/functions/_lib/library-read-model.ts`.
 *
 * PR4: además del GET, maneja el PATCH de acciones (renombrar / papelera /
 * restaurar) contra una capa de overrides EN MEMORIA (espejo conceptual de
 * `library_item_overrides`): renombrar pisa el título y `deleted` oculta el item
 * de la lista normal y lo muestra bajo `incluyeEliminados`. Persiste durante la
 * sesión (no toca localStorage; al recargar vuelve al seed), suficiente para
 * recorrer rename/delete/undo/restore + la papelera en modo prueba.
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
    // PR-A: key con extensión `.pdf` para que demoMedia sirva un PDF mínimo
    // válido y el visor pdf.js renderice en modo prueba (en vez de errorear).
    storage_key: 'legacy-single-user/demo-att-1.pdf',
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
    // PR-A: key con extensión `.md` para que demoMedia sirva texto y el visor
    // de texto lo muestre en modo prueba.
    storage_key: 'legacy-single-user/demo-doc-2.md',
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
    // PR-A: key con extensión `.json` para que demoMedia sirva JSON y el visor
    // de texto lo muestre (pretty-printed) en modo prueba.
    storage_key: 'legacy-single-user/demo-other-1.json',
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

/**
 * Capa de overrides en memoria (espejo de `library_item_overrides`). Clave
 * lógica `kind:itemId`. Vive en el módulo: persiste durante la sesión y se
 * pierde al recargar (modo prueba, sin DB). Modelamos lo que PR4/PR-C usan:
 * título renombrado, la marca de papelera, las etiquetas y el estado fijado.
 */
type DemoOverride = {
  title?: string
  deleted?: boolean
  tags?: string[]
  pinned?: boolean
}
const demoOverrides = new Map<string, DemoOverride>()

function overrideKey(kind: string, itemId: string): string {
  return `${kind}:${itemId}`
}

/** Aplica los overrides en memoria a una fila del seed. */
function applyOverride(row: LibraryItemRow): LibraryItemRow & { deleted: boolean } {
  const ov = demoOverrides.get(overrideKey(row.item_kind, row.item_id))
  return {
    ...row,
    title: ov?.title ?? row.title,
    tags: ov?.tags ?? row.tags,
    pinned: ov?.pinned ?? row.pinned,
    deleted: ov?.deleted ?? false,
  }
}

/** Normaliza para comparar títulos sin distinguir mayúsculas/acentos. */
function foldTitle(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function compareUpdatedAt(a: LibraryItemRow, b: LibraryItemRow): number {
  if (a.updated_at === b.updated_at) return 0
  return a.updated_at < b.updated_at ? -1 : 1
}

function compareCreatedAt(a: LibraryItemRow, b: LibraryItemRow): number {
  if (a.created_at === b.created_at) return 0
  return a.created_at < b.created_at ? -1 : 1
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
  // Papelera (PR4): incluyeEliminados muestra los ocultos en vez de los visibles.
  const incluyeEliminados =
    params.get('incluyeEliminados') === 'true' || params.get('incluyeEliminados') === '1'
  // Clamp a 1..100 como el contrato del backend: un limit negativo o enorme
  // rompería el slicing y podría generar un nextCursor negativo.
  const parsedLimit = Number.parseInt(params.get('limit') ?? '', 10)
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(100, Math.max(1, parsedLimit))
    : DEFAULT_LIMIT
  const cursorRaw = Number.parseInt(params.get('cursor') ?? '0', 10)
  const offset = Number.isFinite(cursorRaw) && cursorRaw > 0 ? cursorRaw : 0

  // Aplicar overrides (título / papelera) sobre el seed, luego filtrar por el
  // estado de papelera (la lista normal oculta los eliminados y viceversa).
  let rows = SEED.map(applyOverride).filter((row) =>
    incluyeEliminados ? row.deleted : !row.deleted,
  )

  // Filtro por pestaña: imagenes → solo image; archivos → todo menos image.
  rows = rows.filter((row) => {
    if (tab === 'imagenes') return row.file_type === 'image'
    if (tab === 'archivos') return row.file_type !== 'image'
    return true
  })

  // Búsqueda por título (substring, sin distinguir mayúsculas/acentos).
  if (q) rows = rows.filter((row) => foldTitle(row.title).includes(q))

  // Filtros del popover (espejo del WHERE del read-model).
  if (tipo) rows = rows.filter((row) => row.file_type === tipo)
  if (fuente) rows = rows.filter((row) => row.source === fuente)

  // Orden + desempate estable por item_id (igual que el backend). Los items
  // fijados van SIEMPRE primero, sin importar el orden elegido (espejo del
  // `ORDER BY pinned DESC, …` del read-model).
  const sorted = [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    let primary = 0
    switch (orden) {
      case 'modificado-asc':
        primary = compareUpdatedAt(a, b)
        break
      case 'creado-desc':
        primary = -compareCreatedAt(a, b)
        break
      case 'creado-asc':
        primary = compareCreatedAt(a, b)
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
  // Sacamos el flag interno `deleted` antes de devolver: la fila del endpoint no
  // lo lleva (el read-model real ya filtró por deleted_at en SQL).
  const items = sorted
    .slice(start, start + limit)
    .map(({ deleted: _deleted, ...row }) => row)
  const nextCursor = start + limit < total ? String(start + limit) : null
  return { items, nextCursor }
}

/**
 * Maneja un PATCH /api/biblioteca-item/:kind/:id contra la capa de overrides en
 * memoria. `{ displayTitle }` renombra; `{ deleted }` manda a / saca de la
 * papelera; `{ tags }` reemplaza las etiquetas; `{ pinned }` fija / suelta.
 * Devuelve `{ ok: true }` (forma del endpoint real). kind/itemId vienen del
 * path ya decodificados.
 */
export function routeDemoBibliotecaMutation(
  kind: string,
  itemId: string,
  body: Record<string, unknown>,
): { ok: true } {
  const key = overrideKey(kind, itemId)
  const current = demoOverrides.get(key) ?? {}
  if (typeof body.displayTitle === 'string') {
    current.title = body.displayTitle.trim()
  }
  if (typeof body.deleted === 'boolean') {
    current.deleted = body.deleted
  }
  if (Array.isArray(body.tags)) {
    // Solo strings, recortadas; espejo del saneo del backend.
    current.tags = (body.tags as unknown[])
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
  }
  if (typeof body.pinned === 'boolean') {
    current.pinned = body.pinned
  }
  demoOverrides.set(key, current)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Conexiones (PR-C) — "aparece en". Store en memoria de vínculos por item con
// objetos de dominio (entidad / nota / momento). Espejo conceptual de
// `library_item_links`: clave lógica `kind:itemId`, cada vínculo lleva su
// `targetKind`/`targetId` y resolvemos `targetTitle` contra los seeds de la
// demo (entidades, notas, momentos). Persiste durante la sesión.
// ---------------------------------------------------------------------------

/** Forma del vínculo tal cual lo emite el endpoint real (camelCase). */
export type DemoLibraryLinkRow = {
  id: string
  targetKind: 'entidad' | 'nota' | 'momento'
  targetId: string
  targetTitle: string | null
  createdAt: string
}

/** Vínculos por item. Clave `kind:itemId`. */
const demoLinks = new Map<string, DemoLibraryLinkRow[]>()

/**
 * Resolutor de títulos de destino: lo inyecta el router (que sí ve el store de
 * la demo) para que `targetTitle` salga del MISMO seed que alimenta al picker
 * (entidades / notas / momentos). Así `demoBiblioteca` no importa el store y se
 * mantiene autocontenido, pero los títulos quedan coherentes.
 */
export type DemoTargetResolver = (
  targetKind: 'entidad' | 'nota' | 'momento',
  targetId: string,
) => string | null

let linksSeeded = false
/**
 * Siembra una conexión pre-existente (idempotente). Necesita el resolutor para
 * fijar `targetTitle` desde el seed real; lo llamamos al primer GET de links.
 */
function ensureLinksSeed(resolve: DemoTargetResolver): void {
  if (linksSeeded) return
  linksSeeded = true
  // El PDF fijado "Ficciones (anotado)" ya aparece en la primera entidad
  // sembrada (Borges, id `e-borges`).
  demoLinks.set('pdf-saved:demo-pdf-1', [
    {
      id: 'demo-link-1',
      targetKind: 'entidad',
      targetId: 'e-borges',
      targetTitle: resolve('entidad', 'e-borges'),
      createdAt: daysAgo(1),
    },
  ])
}

/**
 * Maneja /api/biblioteca-links/:kind/:id (GET / POST / DELETE) contra el store
 * de vínculos en memoria. Devuelve las formas del endpoint real:
 *   - GET    → `{ links: DemoLibraryLinkRow[] }`
 *   - POST   → `{ ok: true }` (crea / revive un vínculo; idempotente)
 *   - DELETE → `{ ok: true }` (quita el vínculo por targetKind+targetId)
 * kind/itemId vienen del path ya decodificados; `resolve` mapea destino→título.
 */
export function routeDemoBibliotecaLinks(
  method: string,
  kind: string,
  itemId: string,
  params: URLSearchParams,
  body: Record<string, unknown>,
  resolve: DemoTargetResolver,
): { links: DemoLibraryLinkRow[] } | { ok: true } {
  ensureLinksSeed(resolve)
  const key = overrideKey(kind, itemId)
  const links = demoLinks.get(key) ?? []

  if (method === 'GET') {
    // Resolvemos el título en cada lectura (no devolvemos el guardado): así un
    // destino renombrado o borrado se refleja al instante, igual que el JOIN
    // de prod (que resuelve `targetTitle` en cada list).
    return {
      links: links.map((l) => ({ ...l, targetTitle: resolve(l.targetKind, l.targetId) })),
    }
  }

  if (method === 'POST') {
    const targetKind = String(body.targetKind ?? '') as DemoLibraryLinkRow['targetKind']
    const targetId = String(body.targetId ?? '')
    if (!targetKind || !targetId) return { ok: true }
    // Idempotente: no duplicar un vínculo ya existente al mismo destino.
    const already = links.some(
      (l) => l.targetKind === targetKind && l.targetId === targetId,
    )
    if (!already) {
      demoLinks.set(key, [
        ...links,
        {
          id: `demo-link-${crypto.randomUUID()}`,
          targetKind,
          targetId,
          targetTitle: resolve(targetKind, targetId),
          createdAt: new Date().toISOString(),
        },
      ])
    }
    return { ok: true }
  }

  if (method === 'DELETE') {
    const targetKind = params.get('targetKind')
    const targetId = params.get('targetId')
    demoLinks.set(
      key,
      links.filter((l) => !(l.targetKind === targetKind && l.targetId === targetId)),
    )
    return { ok: true }
  }

  return { ok: true }
}
