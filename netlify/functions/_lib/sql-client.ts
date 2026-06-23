/**
 * Fragmento de SQL crudo (identificadores/keywords bajo control del servidor,
 * nunca input de usuario) para interpolar dentro de un tagged template sin que
 * el driver lo parametrice. Lo produce `sql.unsafe(...)` del cliente Neon HTTP
 * y se concatena literal en `toParameterizedQuery`. Se usa para deduplicar la
 * lista de columnas de proyección de los CTE de recortes.
 */
export type UnsafeRawSql = { sql: string }

export type SqlClient = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>
  transaction?: (queries: (sql: SqlClient) => unknown[]) => Promise<unknown[]>
  unsafe?: (rawSql: string) => UnsafeRawSql
}
