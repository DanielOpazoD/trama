import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'

/**
 * DD3 (audit #1): counts per-entity para EntitiesView.
 *
 * Antes EntitiesView usaba useQuotesQuery() + useRelationshipsQuery()
 * wholesome y construía Maps en memoria para mostrar "N citas · M
 * relaciones" en cada EntityRow. A 100 entidades es invisible; a 10k+
 * descarga ~200MB de relationships+quotes para renderizar números.
 *
 * Este endpoint hace los 2 GROUP BY en Postgres y devuelve
 * [{ id, quoteCount, relCount }] — chico, parametrizable, indexado.
 *
 * No usa cursor — devuelve la lista entera. A 100k entidades el
 * resultado es ~3MB (id + 2 ints por row). Si la trama crece más allá
 * de eso, agregar `?ids=` para filtrar a las que el caller necesita.
 */
export default withObservability('entities-refs-count', async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }
  const sql = getSql()

  // 2 queries paralelas, ambas con WHERE deleted_at IS NULL para
  // matchear las queries normales de las listas.
  type QuoteCount = { entity_id: string; n: string }
  type RelCount = { id: string; n: string }

  const [quoteRows, relFromRows, relToRows] = await Promise.all([
    sql`
      SELECT entity_id, COUNT(*)::text AS n
      FROM quotes
      WHERE deleted_at IS NULL
      GROUP BY entity_id
    ` as unknown as Promise<QuoteCount[]>,
    // Relaciones cuentan por ambos extremos. Aviva: hacemos dos GROUP BY
    // para luego sumar en el cliente del endpoint. Una sola query con
    // UNION/CASE también funciona pero es más críptica.
    sql`
      SELECT from_id AS id, COUNT(*)::text AS n
      FROM relationships
      WHERE deleted_at IS NULL
      GROUP BY from_id
    ` as unknown as Promise<RelCount[]>,
    sql`
      SELECT to_id AS id, COUNT(*)::text AS n
      FROM relationships
      WHERE deleted_at IS NULL AND from_id <> to_id
      GROUP BY to_id
    ` as unknown as Promise<RelCount[]>,
  ])

  const quoteCounts = new Map<string, number>()
  for (const row of quoteRows) {
    quoteCounts.set(row.entity_id, Number(row.n))
  }
  const relCounts = new Map<string, number>()
  for (const row of relFromRows) {
    relCounts.set(row.id, Number(row.n))
  }
  for (const row of relToRows) {
    relCounts.set(row.id, (relCounts.get(row.id) ?? 0) + Number(row.n))
  }

  // Unimos los ids que aparecieron en cualquiera de los dos. Devolvemos
  // solo las entidades con count > 0 para minimizar payload. El cliente
  // asume `0` para los ids ausentes.
  const allIds = new Set<string>([...quoteCounts.keys(), ...relCounts.keys()])
  const items = Array.from(allIds, (id) => ({
    id,
    quoteCount: quoteCounts.get(id) ?? 0,
    relCount: relCounts.get(id) ?? 0,
  }))

  return Response.json({ items })
})

export const config: Config = {
  path: '/api/entities-refs-count',
}
