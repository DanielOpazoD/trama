import { getDatabase, type ServerlessDatabaseConnection } from '@netlify/database'

/**
 * Returns the Neon HTTP client (`sql\`SELECT ...\`` tagged template) that the
 * Netlify Database extension wires up at runtime via NETLIFY_DB_URL.
 *
 * The legacy setup read NETLIFY_DATABASE_URL with @neondatabase/serverless
 * directly; that variable was retired with the deprecated @netlify/neon
 * extension. The httpClient exposed by @netlify/database is the same Neon HTTP
 * function, so all callers keep their existing template literals unchanged.
 */
export function getSql(): ServerlessDatabaseConnection['httpClient'] {
  const conn = getDatabase()
  if (conn.driver !== 'serverless') {
    throw new Error(
      `Expected serverless DB driver but got '${conn.driver}'. Functions only run on Neon HTTP.`,
    )
  }
  return conn.httpClient
}

/**
 * N9: helper tipado para queries SELECT. Elimina el patrón
 * `as unknown as Row[]` que se repetía en ~50 call sites.
 *
 * El cliente Neon HTTP devuelve `Promise<Record<string, any>[]>` —
 * TypeScript no infiere el tipo del SELECT. `sqlTyped<Row>(template)`
 * envuelve esa promise y la tipa como `Promise<Row[]>`, dándote
 * autocomplete y type-check en el resultado.
 *
 * @example
 *   type Row = { id: string; name: string }
 *   const rows = await sqlTyped<Row>(sql`
 *     SELECT id, name FROM entities WHERE deleted_at IS NULL
 *   `)
 *   rows[0].name  // string, autocompleted
 *
 * Patrón vs el anterior:
 *
 *   // ❌ Antes
 *   const rows = (await sql`SELECT id FROM entities`) as unknown as Array<{ id: string }>
 *
 *   // ✅ Ahora
 *   const rows = await sqlTyped<{ id: string }>(sql`SELECT id FROM entities`)
 *
 * Limitaciones:
 * - No valida el shape en runtime — `Row` es promesa del programador.
 *   Si SELECTeas `name` pero lo tipas como `nombre`, TS no avisa.
 *   Para defensive parsing usá Zod sobre el resultado.
 * - No detecta SELECTs sin las columnas declaradas. Para eso habría que
 *   integrar un AST parser de SQL — fuera de alcance.
 */
export function sqlTyped<Row>(query: Promise<unknown>): Promise<Row[]> {
  return query as Promise<Row[]>
}
