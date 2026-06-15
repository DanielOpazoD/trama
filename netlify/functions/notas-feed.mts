import type { Config } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import {
  buildFeedPlan,
  encodeFeedCursor,
  parseFeedParams,
  type FeedKind,
} from './_lib/notas-feed.js'

/**
 * Feed unificado de Notas (notas + recortes) servido por SQL.
 *
 * GET /api/notas-feed?segment=todo|escritas|capturas&status=…&tag=…&day=…&q=…&cursor=…&limit=…
 *
 * Estrategia (read-model `objects`):
 *   1. Sobre la vista `objects` (notas + recortes, ya con `deleted_at IS NULL`
 *      bakeado) calculamos el conjunto FILTRADO, ORDENADO y PAGINADO de
 *      `(kind, id)` de la página por keyset `(created_at DESC, id DESC)`.
 *   2. Con esos ids traemos las FILAS COMPLETAS de `notes`/`recortes` (para que
 *      el cliente pinte tarjetas completas, igual que antes).
 *   3. Devolvemos los ítems en el ORDEN del feed + el cursor de la próxima
 *      página.
 *
 * Respuesta: { items: Array<{ type, id, createdAt, note?, recorte? }>,
 *              nextCursor: string | null } — el equivalente server-side de
 * `CaptureItem[]`. Favoritos NO se sirve acá (es su propio panel).
 */

type PageRow = { kind: FeedKind; id: string; created_at: string; cursor_val: string }

type NoteRow = {
  id: string
  content: string
  title: string | null
  tags: string[]
  pinned: boolean
  promoted_momento_id: string | null
  source: string | null
  created_at: string
  updated_at: string
  has_images: boolean
}

type RecorteRow = {
  id: string
  text: string
  source_url: string | null
  source_title: string | null
  source_author: string | null
  note: string | null
  image_url: string | null
  image_key: string | null
  capture_mode: string | null
  status: 'pending' | 'promoted' | 'archived'
  promoted_target: 'quote' | 'entity' | 'momento' | null
  promoted_id: string | null
  source: string | null
  captured_at: string | null
  created_at: string
  updated_at: string
}

export default withObservability(
  'notas-feed',
  async (req: Request, _ctx, { requestId }) => {
    if (req.method !== 'GET') return ApiErrors.methodNotAllowed(requestId)

    // getAuthedUser fija el contexto RLS; getSql() lo lee.
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()

    const url = new URL(req.url)
    const parsed = parseFeedParams(url.searchParams)
    if (!parsed.success) {
      return ApiErrors.validation(requestId, parsed.error.issues[0]?.message ?? 'parámetros inválidos')
    }
    const plan = buildFeedPlan(parsed.data)
    if (!plan) return ApiErrors.validation(requestId, 'cursor inválido')

    // --- Página de (kind, id) sobre la vista `objects`, por keyset. ---------
    //
    // El `cursor_val` se renderiza a texto con microsegundos + offset UTC para
    // que el cursor round-tripee exacto (igual que el motor de queries) y el
    // keyset no rompa ante empates de created_at.
    const cursorTs = plan.cursor?.ts ?? null
    const cursorId = plan.cursor?.id ?? null
    const dayFrom = plan.dayRange?.from ?? null
    const dayTo = plan.dayRange?.to ?? null

    const pageRows = await sqlTyped<PageRow>(sql`
      SELECT
        o.kind,
        o.id,
        o.created_at,
        to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') AS cursor_val
      FROM objects o
      WHERE o.user_id = ${userId}
        AND o.kind = ANY(${plan.kinds}::text[])
        -- Triage de recortes (no afecta a notas): replica RecorteStatusFilter.
        --   'default' (sin status) → oculta archivados
        --   'all'                  → incluye los tres
        --   estado explícito       → solo ese estado
        AND (
          o.kind <> 'recorte'
          OR ${plan.recorteStatus}::text = 'all'
          OR (${plan.recorteStatus}::text = 'default' AND o.status <> 'archived')
          OR (${plan.recorteStatus}::text NOT IN ('all', 'default') AND o.status = ${plan.recorteStatus})
        )
        -- Día local aproximado por rango UTC sobre created_at (ver notas-feed.ts).
        AND (${dayFrom}::timestamptz IS NULL OR o.created_at >= ${dayFrom}::timestamptz)
        AND (${dayTo}::timestamptz IS NULL OR o.created_at < ${dayTo}::timestamptz)
        -- Etiqueta exacta: solo matchea notas (los recortes no tienen tags).
        AND (${plan.tag}::text IS NULL OR (o.kind = 'note' AND o.tags @> ARRAY[${plan.tag}]::text[]))
        -- Búsqueda lexical case-insensitive sobre título + cuerpo.
        AND (
          ${plan.qLike}::text IS NULL
          OR o.body ILIKE ${plan.qLike}
          OR (o.title IS NOT NULL AND o.title ILIKE ${plan.qLike})
        )
        -- Keyset: (created_at, id) estrictamente menor que el cursor.
        AND (
          ${cursorTs}::timestamptz IS NULL
          OR o.created_at < ${cursorTs}::timestamptz
          OR (o.created_at = ${cursorTs}::timestamptz AND o.id < ${cursorId}::uuid)
        )
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT ${plan.limit + 1}
    `)

    const hasMore = pageRows.length > plan.limit
    const page = hasMore ? pageRows.slice(0, plan.limit) : pageRows

    // --- Filas completas para los ids de la página (una query por tabla). ----
    const noteIds = page.filter((r) => r.kind === 'note').map((r) => r.id)
    const recorteIds = page.filter((r) => r.kind === 'recorte').map((r) => r.id)

    const [noteRows, recorteRows] = await Promise.all([
      noteIds.length > 0
        ? sqlTyped<NoteRow>(sql`
            SELECT id, content, title, tags, pinned, promoted_momento_id, source,
              created_at, updated_at,
              EXISTS(
                SELECT 1 FROM notas_attachments na
                WHERE na.user_id = notes.user_id
                  AND na.owner_type = 'note'
                  AND na.owner_id = notes.id::text
                  AND na.mime_type LIKE 'image/%'
                  AND na.deleted_at IS NULL
              ) AS has_images
            FROM notes
            WHERE deleted_at IS NULL AND user_id = ${userId}
              AND id = ANY(${noteIds}::uuid[])
          `)
        : Promise.resolve([] as NoteRow[]),
      recorteIds.length > 0
        ? sqlTyped<RecorteRow>(sql`
            SELECT id, text, source_url, source_title, source_author, note,
              image_url, image_key, capture_mode, status, promoted_target,
              promoted_id, source, captured_at, created_at, updated_at
            FROM recortes
            WHERE deleted_at IS NULL AND user_id = ${userId}
              AND id = ANY(${recorteIds}::uuid[])
          `)
        : Promise.resolve([] as RecorteRow[]),
    ])

    const noteById = new Map(noteRows.map((r) => [r.id, r]))
    const recorteById = new Map(recorteRows.map((r) => [r.id, r]))

    // Ensamblado en el ORDEN del feed (el de la página keyset). Si una fila
    // desapareció entre la página y el fetch (borrado concurrente), se omite.
    const items: Array<{
      type: FeedKind
      id: string
      createdAt: string
      note?: NoteRow
      recorte?: RecorteRow
    }> = []
    for (const row of page) {
      if (row.kind === 'note') {
        const note = noteById.get(row.id)
        if (note) items.push({ type: 'note', id: row.id, createdAt: row.created_at, note })
      } else {
        const recorte = recorteById.get(row.id)
        if (recorte)
          items.push({ type: 'recorte', id: row.id, createdAt: row.created_at, recorte })
      }
    }

    const last = page[page.length - 1]
    const nextCursor =
      hasMore && last ? encodeFeedCursor({ ts: last.cursor_val, id: last.id }) : null

    return Response.json({ items, nextCursor })
  },
)

export const config: Config = {
  path: '/api/notas-feed',
}
