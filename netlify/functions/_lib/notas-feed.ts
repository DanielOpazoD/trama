/**
 * Lógica PURA del feed unificado de Notas (notas + recortes) servido por SQL.
 *
 * El endpoint `notas-feed.mts` usa estos helpers para:
 *   - validar los query params (Zod),
 *   - codificar/decodificar el cursor keyset,
 *   - traducir el `day` (YYYY-MM-DD, día local) a un rango UTC sobre created_at,
 *   - decidir qué `kind`s entran según el segmento.
 *
 * Se extrae acá (sin DB ni Request) para poder testear el keyset y el rango de
 * día sin levantar un servidor — la parte frágil de mover el feed a SQL.
 */
import { z } from 'zod'

/** Clases de objeto que el feed sirve hoy (extensible más adelante). */
export type FeedKind = 'note' | 'recorte'

/**
 * Cursor keyset: el `created_at` (ISO, microsegundos UTC) y el `id` de la
 * última fila de la página, para paginar `(created_at, id) < (ts, id)`.
 */
export type FeedCursor = { ts: string; id: string }

export function encodeFeedCursor(c: FeedCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url')
}

/** Devuelve null si el cursor es inválido (el caller decide si es un 400). */
export function decodeFeedCursor(raw: string): FeedCursor | null {
  try {
    const obj: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    if (
      obj &&
      typeof obj === 'object' &&
      typeof (obj as FeedCursor).ts === 'string' &&
      typeof (obj as FeedCursor).id === 'string'
    ) {
      return obj as FeedCursor
    }
  } catch {
    /* cae a null */
  }
  return null
}

/**
 * Día local 'YYYY-MM-DD' → rango UTC [from, to) sobre created_at.
 *
 * `localDayKey` (cliente) deriva el día desde la zona horaria del navegador.
 * El servidor no conoce esa zona, así que NO podemos reproducirlo exacto. La
 * aproximación documentada: tomamos el día calendario UTC del string. Para
 * timestamps cerca de medianoche en zonas alejadas de UTC, un ítem puede caer
 * en un día adyacente respecto del filtro client-side previo. Es una
 * aproximación deliberada (ver GOAL); el feed sigue siendo coherente porque el
 * mismo criterio se aplica a notas y recortes.
 *
 * Devuelve límites ISO (`from` inclusive, `to` exclusivo). Lanza si el formato
 * del día es inválido (el caller ya validó con Zod, esto es defensa en
 * profundidad).
 */
export function dayToUtcRange(day: string): { from: string; to: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) throw new Error(`día inválido: ${day}`)
  const from = `${day}T00:00:00.000Z`
  // Día siguiente (medianoche UTC) como cota superior exclusiva.
  const start = new Date(from)
  const next = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { from, to: next.toISOString() }
}

/** Qué `kind`s incluye cada segmento (favoritos no se sirve por acá). */
export function kindsForSegment(segment: FeedSegment): FeedKind[] {
  switch (segment) {
    case 'escritas':
      return ['note']
    case 'capturas':
      return ['recorte']
    case 'todo':
    default:
      return ['note', 'recorte']
  }
}

/** Segmento servible por el endpoint (favoritos es su propio panel). */
export const FEED_SEGMENTS = ['todo', 'escritas', 'capturas'] as const
export type FeedSegment = (typeof FEED_SEGMENTS)[number]

export const FEED_STATUS = ['all', 'pending', 'promoted', 'archived'] as const
export type FeedStatus = (typeof FEED_STATUS)[number]

export const DEFAULT_FEED_LIMIT = 30
export const MAX_FEED_LIMIT = 100

/**
 * Schema de los query params del feed. Cadenas vacías se tratan como ausentes
 * (los `URLSearchParams` que la UI no setea llegan como null; los que setea
 * vacíos, como ''). El triage de recortes (`status`) replica la semántica de
 * `RecorteStatusFilter`: ausente → oculta archivados; 'all' → los tres.
 */
export const NotasFeedQuery = z.object({
  segment: z.enum(FEED_SEGMENTS).default('todo'),
  status: z.enum(FEED_STATUS).optional(),
  tag: z.string().trim().min(1).max(120).optional(),
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'día debe ser YYYY-MM-DD')
    .optional(),
  q: z.string().trim().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_FEED_LIMIT).default(DEFAULT_FEED_LIMIT),
})

export type NotasFeedParams = z.infer<typeof NotasFeedQuery>

/**
 * Parsea los query params crudos (de `URLSearchParams`) al shape validado.
 * Normaliza '' → undefined ANTES de validar para que un param vacío no falle.
 */
export function parseFeedParams(
  searchParams: URLSearchParams,
): ReturnType<typeof NotasFeedQuery.safeParse> {
  const raw: Record<string, string> = {}
  for (const key of ['segment', 'status', 'tag', 'day', 'q', 'cursor', 'limit']) {
    const v = searchParams.get(key)
    if (v !== null && v.trim() !== '') raw[key] = v
  }
  return NotasFeedQuery.safeParse(raw)
}

/**
 * Patrón ILIKE para "contiene": escapa los comodines de LIKE (`%` `_` `\`) para
 * que el texto del usuario se trate literal. Espejo de la lógica del motor de
 * queries (`compile.ts`).
 */
export function likeContains(value: string): string {
  const escaped = value.replace(/[\\%_]/g, (c) => `\\${c}`)
  return `%${escaped}%`
}

/**
 * Plan de filtros derivado de los params validados: la pieza testeable que
 * decide rango de día, kinds y triage de status SIN tocar SQL ni DB.
 */
export type FeedPlan = {
  kinds: FeedKind[]
  cursor: FeedCursor | null
  dayRange: { from: string; to: string } | null
  /** Texto de búsqueda escapado para ILIKE, o null. */
  qLike: string | null
  /** Tag exacto (solo matchea notas; los recortes no tienen tags), o null. */
  tag: string | null
  /** Triage de recortes: 'all' | 'pending' | 'promoted' | 'archived' | 'default'. */
  recorteStatus: FeedStatus | 'default'
  limit: number
}

/** Devuelve `null` si el cursor vino y es inválido (el caller lo trata como 400). */
export function buildFeedPlan(params: NotasFeedParams): FeedPlan | null {
  let cursor: FeedCursor | null = null
  if (params.cursor) {
    cursor = decodeFeedCursor(params.cursor)
    if (!cursor) return null
  }
  return {
    kinds: kindsForSegment(params.segment),
    cursor,
    dayRange: params.day ? dayToUtcRange(params.day) : null,
    qLike: params.q ? likeContains(params.q) : null,
    tag: params.tag ?? null,
    recorteStatus: params.status ?? 'default',
    limit: params.limit,
  }
}
