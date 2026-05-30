import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { logEvent } from './_lib/observability.js'

/**
 * GET /api/entities-duplicates — candidatos a entidades repetidas.
 *
 * Dos señales (el usuario revisa y confirma cada grupo antes de combinar):
 *   1. Nombre normalizado idéntico (minúsculas, sin tildes/puntuación) →
 *      duplicados de alta confianza ("Borges" / "borges").
 *   2. Embeddings muy cercanos (coseno) → variantes con nombre distinto
 *      ("J. L. Borges" / "Jorge Luis Borges"). Se excluyen los pares ya
 *      cubiertos por el grupo de nombre.
 *
 * El self-join de embeddings es O(n²); acotado a `EMBEDDING_SCAN_CAP` entidades
 * (a más, se omite esa señal y se avisa con `embeddingSkipped`). A la escala
 * actual (cientos) es instantáneo.
 */
type Cand = { id: string; name: string; type: string }

const EMBEDDING_SCAN_CAP = 1500
const SIM_THRESHOLD = 0.08 // distancia coseno (< 0.08 ≈ similitud > 0.92)

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export default withObservability(
  'entities-duplicates',
  async (req: Request, _ctx: Context, { requestId }) => {
    if (req.method !== 'GET') return ApiErrors.methodNotAllowed(requestId)
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()

    const rows = await sqlTyped<Cand>(sql`
      SELECT id, name, type FROM entities
      WHERE deleted_at IS NULL AND user_id = ${userId}
    `)

    type Group = { reason: 'name' | 'similar'; similarity?: number; entities: Cand[] }
    const groups: Group[] = []
    const inNameGroup = new Set<string>()

    // 1) Grupos por nombre normalizado.
    const byName = new Map<string, Cand[]>()
    for (const r of rows) {
      const key = normalizeName(r.name)
      if (!key) continue
      const arr = byName.get(key)
      if (arr) arr.push(r)
      else byName.set(key, [r])
    }
    for (const arr of byName.values()) {
      if (arr.length >= 2) {
        groups.push({ reason: 'name', entities: arr })
        for (const e of arr) inNameGroup.add(e.id)
      }
    }

    // 2) Pares por similitud de embeddings.
    let embeddingSkipped = false
    if (rows.length <= EMBEDDING_SCAN_CAP) {
      const pairs = await sqlTyped<{ a_id: string; b_id: string; sim: number }>(sql`
        SELECT a.id AS a_id, b.id AS b_id, (1 - (a.embedding <=> b.embedding))::float8 AS sim
        FROM entities a
        JOIN entities b ON a.id < b.id
        WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
          AND a.user_id = ${userId} AND b.user_id = ${userId}
          AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
          AND (a.embedding <=> b.embedding) < ${SIM_THRESHOLD}
        ORDER BY sim DESC
        LIMIT 50
      `)
      const byId = new Map(rows.map((r) => [r.id, r] as const))
      for (const p of pairs) {
        // Si ambos ya están en un grupo por nombre, no repetir.
        if (inNameGroup.has(p.a_id) && inNameGroup.has(p.b_id)) continue
        const a = byId.get(p.a_id)
        const b = byId.get(p.b_id)
        if (!a || !b) continue
        groups.push({
          reason: 'similar',
          similarity: Math.round(p.sim * 100) / 100,
          entities: [a, b],
        })
      }
    } else {
      embeddingSkipped = true
    }

    logEvent({ event: 'entities_duplicates_scan', groups: groups.length, embeddingSkipped })
    return Response.json({ groups, embeddingSkipped })
  },
)

export const config: Config = {
  path: '/api/entities-duplicates',
}
