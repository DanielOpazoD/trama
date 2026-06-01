import type { SqlClient } from './db'

export type UserRlsSql = (strings: TemplateStringsArray, ...values: unknown[]) => unknown

type TransactionCapableSql = {
  transaction: (queries: (sql: UserRlsSql) => unknown[]) => Promise<unknown[]>
}

function hasTransaction(sql: SqlClient): boolean {
  return typeof (sql as { transaction?: unknown }).transaction === 'function'
}

/**
 * Ejecuta un batch de queries en una transacción Neon HTTP con el userId
 * disponible para políticas RLS vía `current_setting('app.current_user_id')`.
 *
 * Neon HTTP no mantiene sesión entre requests sueltas; por eso el seteo debe
 * vivir en la misma transacción que las queries protegidas.
 */
export async function runWithUserRls(
  sql: SqlClient,
  userId: string,
  buildQueries: (sql: UserRlsSql) => unknown[],
): Promise<unknown[][]> {
  const trimmedUserId = userId.trim()
  if (!trimmedUserId) {
    throw new Error('userId requerido para contexto RLS')
  }
  if (!hasTransaction(sql)) {
    throw new Error('El cliente SQL no soporta transacciones para contexto RLS')
  }

  const transaction = (sql as unknown as TransactionCapableSql).transaction
  const results = await transaction((tx) => [
    tx`SELECT set_config('app.current_user_id', ${trimmedUserId}, true)`,
    ...buildQueries(tx),
  ])
  return results.slice(1) as unknown[][]
}

export async function queryWithUserRls<Row>(
  sql: SqlClient,
  userId: string,
  buildQuery: (sql: UserRlsSql) => unknown,
): Promise<Row[]> {
  const [rows] = await runWithUserRls(sql, userId, (scoped) => [buildQuery(scoped)])
  return (rows ?? []) as Row[]
}
