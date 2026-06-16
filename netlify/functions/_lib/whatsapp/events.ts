import { sqlTyped, type SqlClient } from '../db.js'

/**
 * Observabilidad del módulo WhatsApp. El webhook persiste un evento por
 * resultado de procesamiento (best-effort: si falla, NO rompe la captura) y el
 * panel del usuario los agrega. Complementa a `logEvent` (que va a stdout y no
 * es consultable). Ver tabla `whatsapp_events`.
 */

export type WhatsAppEventInput = {
  /** Categoría: 'capture' | 'media' | 'vision' | 'transcription' | 'recall'. */
  event: string
  /** Ruta/destino cuando aplica (note/recorte/momento/quote/entity/task). */
  kind?: string | null
  ok: boolean
  /** Razón corta de la falla (se acota), o null. */
  detail?: string | null
}

/** Inserta un evento de observabilidad. Best-effort: traga cualquier error para
 *  no afectar la captura (lo importante ya quedó guardado). Asume RLS del dueño
 *  ya fijado (el webhook llama setCurrentRlsUser antes). */
export async function persistWhatsAppEvent(
  sql: SqlClient,
  userId: string,
  input: WhatsAppEventInput,
): Promise<void> {
  try {
    await sql`
      INSERT INTO whatsapp_events (user_id, event, kind, ok, detail)
      VALUES (
        ${userId}, ${input.event}, ${input.kind ?? null}, ${input.ok},
        ${input.detail ? input.detail.slice(0, 500) : null}
      )
    `
  } catch {
    // best-effort: la observabilidad nunca debe tumbar una captura.
  }
}

export type WhatsAppMetrics = {
  days: number
  total: number
  ok: number
  failed: number
  /** Capturas exitosas por destino (note/recorte/momento/…). */
  byKind: Array<{ kind: string; count: number }>
  /** Por categoría de evento: éxitos y fallas. */
  byEvent: Array<{ event: string; ok: number; failed: number }>
  /** Actividad diaria (día UTC → totales), del más viejo al más nuevo. */
  daily: Array<{ day: string; count: number; failed: number }>
  /** Últimos eventos para un feed. */
  recent: Array<{
    event: string
    kind: string | null
    ok: boolean
    detail: string | null
    createdAt: string
  }>
}

/** Agrega las métricas del módulo para el panel del usuario (últimos `days`). */
export async function readWhatsAppMetrics(
  sql: SqlClient,
  userId: string,
  days: number,
): Promise<WhatsAppMetrics> {
  const since = `${days} days`

  const byEventRows = await sqlTyped<{ event: string; ok: number; failed: number }>(sql`
    SELECT event,
      COUNT(*) FILTER (WHERE ok)::int AS ok,
      COUNT(*) FILTER (WHERE NOT ok)::int AS failed
    FROM whatsapp_events
    WHERE user_id = ${userId} AND created_at > NOW() - ${since}::interval
    GROUP BY event
    ORDER BY (COUNT(*)) DESC
  `)

  const byKindRows = await sqlTyped<{ kind: string; count: number }>(sql`
    SELECT kind, COUNT(*)::int AS count
    FROM whatsapp_events
    WHERE user_id = ${userId} AND created_at > NOW() - ${since}::interval
      AND event = 'capture' AND ok AND kind IS NOT NULL
    GROUP BY kind
    ORDER BY (COUNT(*)) DESC
  `)

  const dailyRows = await sqlTyped<{ day: string; count: number; failed: number }>(sql`
    SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE NOT ok)::int AS failed
    FROM whatsapp_events
    WHERE user_id = ${userId} AND created_at > NOW() - ${since}::interval
    GROUP BY 1
    ORDER BY 1 ASC
  `)

  const recentRows = await sqlTyped<{
    event: string
    kind: string | null
    ok: boolean
    detail: string | null
    created_at: string
  }>(sql`
    SELECT event, kind, ok, detail, created_at
    FROM whatsapp_events
    WHERE user_id = ${userId} AND created_at > NOW() - ${since}::interval
    ORDER BY created_at DESC
    LIMIT 15
  `)

  const ok = byEventRows.reduce((n, r) => n + r.ok, 0)
  const failed = byEventRows.reduce((n, r) => n + r.failed, 0)
  return {
    days,
    total: ok + failed,
    ok,
    failed,
    byKind: byKindRows,
    byEvent: byEventRows,
    daily: dailyRows,
    recent: recentRows.map((r) => ({
      event: r.event,
      kind: r.kind,
      ok: r.ok,
      detail: r.detail,
      createdAt: r.created_at,
    })),
  }
}
