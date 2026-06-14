import { sqlTyped, type SqlClient } from '../db.js'
import type { ObjectKind, QueryInput } from './ast.js'
import { asTemplateStrings } from './builder.js'
import { compileQuery, encodeCursor } from './compile.js'

/**
 * Ejecuta una query compilada contra el cliente SQL (scopeado por RLS) y
 * devuelve los hits normalizados + el cursor keyset para la siguiente página.
 *
 * Recibe `sql` por parámetro (no llama a getSql) para que sea testeable contra
 * un Postgres real con un adapter `pg` (ver query.integration.test.ts) y contra
 * un mock en los tests de endpoint.
 */
export type QueryHit = {
  kind: ObjectKind
  id: string
  title: string | null
  snippet: string | null
  createdAt: string
  tags: string[]
}
export type QueryResult = { items: QueryHit[]; nextCursor: string | null }

type Row = {
  kind: ObjectKind
  id: string
  title: string | null
  snippet: string | null
  sort_val: string
  created_at: string
  tags: string[] | null
}

export async function runQuery(sql: SqlClient, input: QueryInput): Promise<QueryResult> {
  const { builder, limit } = compileQuery(input)
  const tagged = sql as unknown as (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown[]>
  const rows = await sqlTyped<Row>(
    tagged(asTemplateStrings(builder.parts), ...builder.values),
  )

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const items: QueryHit[] = page.map((r) => ({
    kind: r.kind,
    id: r.id,
    title: r.title,
    snippet: r.snippet,
    createdAt: r.created_at,
    tags: r.tags ?? [],
  }))
  const last = page[page.length - 1]
  const nextCursor =
    hasMore && last ? encodeCursor({ v: last.sort_val, id: last.id }) : null
  return { items, nextCursor }
}
