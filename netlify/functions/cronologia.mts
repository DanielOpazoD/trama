import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'

/**
 * Bloque #4 — Cronología: la superficie de lectura del tiempo.
 *
 * Teje las cuatro corrientes del archivo en un solo hilo cronológico:
 *   - citas     (lo que el lenguaje fijó, con su entidad)
 *   - momentos  (lo que se capturó del día)
 *   - escuchas  (un digest SEMANAL: el artista que más sonó esa semana)
 *   - crónicas  (la voz de la IA sobre el mes — el ensayo mensual)
 *
 * No es Momentos (captura) ni Crónicas (síntesis): es *hojear* el tiempo.
 * Devuelve un stream plano newest-first; el cliente lo agrupa en estaciones.
 *
 * GET /api/cronologia?before=<iso>&limit=<n>
 *   before — cursor: solo entradas con occurred_at < before (opcional).
 *   limit  — default 40, max 100.
 *
 * Paginación correcta de un merge k-vías: cada corriente trae hasta `limit`
 * filas. Una corriente que devuelve EXACTAMENTE `limit` puede esconder más
 * filas viejas; solo es seguro emitir entradas >= la cota más reciente de
 * esas corrientes "tapadas" (la marca de agua). El resto se re-pide en la
 * próxima página. Así ninguna entrada se pierde entre páginas.
 */

type CitaRow = {
  id: string
  occurred_at: string
  text: string
  source: string | null
  entity_id: string
  entity_name: string
}
type MomentoRow = {
  id: string
  occurred_at: string
  momento_kind: string
  text: string
}
type CronicaRow = {
  id: string
  occurred_at: string
  year: number
  month: number
  text: string
}
type EscuchaRow = {
  id: string
  occurred_at: string
  week_start: string
  top_artist: string | null
  top_artist_plays: number
  total_plays: number
}

type Entrada =
  | {
      kind: 'cita'
      id: string
      occurredAt: string
      text: string
      source: string | null
      entityId: string
      entityName: string
    }
  | { kind: 'momento'; id: string; occurredAt: string; momentoKind: string; text: string }
  | {
      kind: 'cronica'
      id: string
      occurredAt: string
      year: number
      month: number
      text: string
    }
  | {
      kind: 'escucha'
      id: string
      occurredAt: string
      weekStart: string
      topArtist: string | null
      topArtistPlays: number
      totalPlays: number
    }

const LIMIT_DEFAULT = 40
const LIMIT_MAX = 100
// Sin cursor empezamos desde "el futuro" — todas las entradas son < esto.
const FAR_FUTURE = '9999-12-31T23:59:59.000Z'

const ms = (iso: string) => new Date(iso).getTime()

export default withObservability(
  'cronologia',
  async (req: Request, _context: Context, { requestId }) => {
    if (req.method !== 'GET') {
      return ApiErrors.methodNotAllowed(requestId)
    }
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()
    const url = new URL(req.url)

    const before = (url.searchParams.get('before') ?? '').trim() || FAR_FUTURE
    const limitParam = url.searchParams.get('limit')
    const limit = Math.min(
      Math.max(
        Number.parseInt(limitParam ?? String(LIMIT_DEFAULT), 10) || LIMIT_DEFAULT,
        1,
      ),
      LIMIT_MAX,
    )

    // Texto representativo de un momento (mismo COALESCE que /api/search).
    const [citaRows, momentoRows, cronicaRows, escuchaRows] = await Promise.all([
      sqlTyped<CitaRow>(sql`
        SELECT q.id::text AS id, q.created_at AS occurred_at, q.text,
               q.source, q.entity_id::text AS entity_id, e.name AS entity_name
        FROM quotes q
        JOIN entities e ON e.id = q.entity_id
          AND e.deleted_at IS NULL
          AND e.user_id = ${userId}
        WHERE q.deleted_at IS NULL
          AND q.user_id = ${userId}
          AND q.created_at < ${before}::timestamptz
        ORDER BY q.created_at DESC
        LIMIT ${limit}
      `),
      sqlTyped<MomentoRow>(sql`
        SELECT m.id::text AS id, m.captured_at AS occurred_at, m.kind AS momento_kind,
               COALESCE(NULLIF(m.payload->>'bodyText', ''), NULLIF(m.payload->>'caption', ''),
                        NULLIF(m.payload->>'title', ''), NULLIF(m.payload->>'source', ''),
                        m.note, '') AS text
        FROM momentos m
        WHERE m.deleted_at IS NULL
          AND m.user_id = ${userId}
          AND m.captured_at < ${before}::timestamptz
        ORDER BY m.captured_at DESC
        LIMIT ${limit}
      `),
      sqlTyped<CronicaRow>(sql`
        SELECT c.id::text AS id,
               (make_timestamptz(c.year, c.month, 1, 0, 0, 0)
                  + interval '1 month' - interval '1 second') AS occurred_at,
               c.year, c.month, left(c.text, 600) AS text
        FROM cronicas c
        WHERE c.user_id = ${userId}
          AND (make_timestamptz(c.year, c.month, 1, 0, 0, 0)
                 + interval '1 month' - interval '1 second') < ${before}::timestamptz
        ORDER BY occurred_at DESC
        LIMIT ${limit}
      `),
      sqlTyped<EscuchaRow>(sql`
        WITH weeks AS (
          SELECT date_trunc('week', played_at) AS week_start,
                 max(played_at) AS occurred_at,
                 count(*)::int AS total_plays
          FROM spotify_plays
          WHERE user_id = ${userId}
            AND played_at < ${before}::timestamptz
          GROUP BY 1
          ORDER BY occurred_at DESC
          LIMIT ${limit}
        ),
        artists AS (
          SELECT date_trunc('week', sp.played_at) AS week_start,
                 a.name AS artist,
                 count(*)::int AS plays
          FROM spotify_plays sp
          CROSS JOIN LATERAL unnest(sp.artist_names) AS a(name)
          WHERE sp.user_id = ${userId}
            AND date_trunc('week', sp.played_at) IN (SELECT week_start FROM weeks)
          GROUP BY 1, 2
        ),
        top AS (
          SELECT DISTINCT ON (week_start) week_start, artist, plays
          FROM artists
          ORDER BY week_start, plays DESC, artist
        )
        SELECT to_char(w.week_start, 'YYYY-MM-DD') AS id,
               w.occurred_at, w.week_start, w.total_plays,
               t.artist AS top_artist, COALESCE(t.plays, 0) AS top_artist_plays
        FROM weeks w
        LEFT JOIN top t ON t.week_start = w.week_start
        ORDER BY w.occurred_at DESC
      `),
    ])

    const citas: Entrada[] = citaRows.map((r) => ({
      kind: 'cita',
      id: r.id,
      occurredAt: r.occurred_at,
      text: r.text,
      source: r.source,
      entityId: r.entity_id,
      entityName: r.entity_name,
    }))
    const momentos: Entrada[] = momentoRows.map((r) => ({
      kind: 'momento',
      id: r.id,
      occurredAt: r.occurred_at,
      momentoKind: r.momento_kind,
      text: r.text,
    }))
    const cronicas: Entrada[] = cronicaRows.map((r) => ({
      kind: 'cronica',
      id: r.id,
      occurredAt: r.occurred_at,
      year: r.year,
      month: r.month,
      text: r.text,
    }))
    const escuchas: Entrada[] = escuchaRows.map((r) => ({
      kind: 'escucha',
      id: r.id,
      occurredAt: r.occurred_at,
      weekStart: r.week_start,
      topArtist: r.top_artist,
      topArtistPlays: r.top_artist_plays,
      totalPlays: r.total_plays,
    }))

    const all = [...citas, ...momentos, ...cronicas, ...escuchas].sort(
      (a, b) => ms(b.occurredAt) - ms(a.occurredAt),
    )

    // Marca de agua: la cota más reciente entre las corrientes que devolvieron
    // exactamente `limit` filas (las que podrían tener más). Nada más viejo es
    // seguro de emitir todavía.
    const tails: number[] = []
    for (const list of [citas, momentos, cronicas, escuchas]) {
      if (list.length >= limit && list.length > 0) {
        tails.push(ms(list[list.length - 1]!.occurredAt))
      }
    }
    const watermark = tails.length ? Math.max(...tails) : null

    const safe =
      watermark === null ? all : all.filter((e) => ms(e.occurredAt) >= watermark)
    const entradas = safe.slice(0, limit)
    const last = entradas[entradas.length - 1]
    const nextCursor =
      last && (watermark !== null || all.length > entradas.length)
        ? last.occurredAt
        : null

    return Response.json({ entradas, nextCursor })
  },
)

export const config: Config = {
  path: '/api/cronologia',
}
