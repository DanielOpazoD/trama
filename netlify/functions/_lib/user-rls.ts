import type { SqlClient } from './sql-client'
import { AsyncLocalStorage } from 'node:async_hooks'

export type UserRlsSql = (strings: TemplateStringsArray, ...values: unknown[]) => unknown

type TransactionCapableSql = {
  transaction: (queries: (sql: UserRlsSql) => unknown[]) => Promise<unknown[]>
}

type ScopedRlsSql = UserRlsSql & {
  transaction?: (queries: (sql: UserRlsSql) => unknown[]) => Promise<unknown[][]>
}

type RlsContext =
  { kind: 'none' } | { kind: 'user'; userId: string; email?: string } | { kind: 'system' }

const rlsContext = new AsyncLocalStorage<RlsContext>()

function hasTransaction(sql: SqlClient): boolean {
  return typeof (sql as { transaction?: unknown }).transaction === 'function'
}

function transactionFor(sql: SqlClient): TransactionCapableSql['transaction'] {
  if (!hasTransaction(sql)) {
    throw new Error('El cliente SQL no soporta transacciones para contexto RLS')
  }
  return (sql as unknown as TransactionCapableSql).transaction
}

function trimUserId(userId: string): string {
  const trimmedUserId = userId.trim()
  if (!trimmedUserId) {
    throw new Error('userId requerido para contexto RLS')
  }
  return trimmedUserId
}

function contextConfigQuery(tx: UserRlsSql, context: RlsContext): unknown {
  if (context.kind === 'system') {
    return tx`SELECT set_config('app.rls_bypass', ${'system'}, true)`
  }
  if (context.kind === 'none') {
    throw new Error('contexto RLS vacío')
  }
  // El email viaja junto al user_id: las policies de compartir (invitaciones
  // por correo) lo comparan vía current_setting('app.current_user_email').
  // Siempre se setea — '' cuando no hay email, así una transacción nunca
  // hereda el valor de otra y las policies (que envuelven con NULLIF) no
  // matchean contra cadena vacía.
  return tx`SELECT set_config('app.current_user_id', ${context.userId}, true),
                   set_config('app.current_user_email', ${context.email ?? ''}, true)`
}

export function setCurrentRlsUser(userId: string, email?: string): void {
  const normalized = email?.trim().toLowerCase()
  rlsContext.enterWith({
    kind: 'user',
    userId: trimUserId(userId),
    ...(normalized ? { email: normalized } : null),
  })
}

export function clearRlsContext(): void {
  rlsContext.disable()
}

export function runWithSystemRls<T>(fn: () => T): T {
  return rlsContext.run({ kind: 'system' }, fn)
}

export function runWithoutRlsContext<T>(fn: () => T): T {
  return rlsContext.run({ kind: 'none' }, fn)
}

export function scopeSqlToRlsContext(sql: SqlClient): SqlClient {
  const scoped = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const context = rlsContext.getStore()
    if (!context || context.kind === 'none') return sql(strings, ...values)
    const transaction = transactionFor(sql)
    return transaction((tx) => [
      contextConfigQuery(tx, context),
      tx(strings, ...values),
    ]).then((results) => results[1] ?? [])
  }) as ScopedRlsSql

  Object.assign(scoped, sql)

  if (hasTransaction(sql)) {
    scoped.transaction = async (buildQueries: (sql: UserRlsSql) => unknown[]) => {
      const context = rlsContext.getStore()
      const transaction = transactionFor(sql)
      if (!context || context.kind === 'none')
        return (await transaction(buildQueries)) as unknown[][]
      const results = await transaction((tx) => [
        contextConfigQuery(tx, context),
        ...buildQueries(tx),
      ])
      return results.slice(1) as unknown[][]
    }
  }

  return scoped as unknown as SqlClient
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
  opts?: { email?: string },
): Promise<unknown[][]> {
  const trimmedUserId = trimUserId(userId)
  const email = opts?.email?.trim().toLowerCase() ?? ''
  const results = await runWithoutRlsContext(async () => {
    const transaction = transactionFor(sql)
    return transaction((tx) => [
      tx`SELECT set_config('app.current_user_id', ${trimmedUserId}, true),
                set_config('app.current_user_email', ${email}, true)`,
      ...buildQueries(tx),
    ])
  })
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
