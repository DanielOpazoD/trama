import { describe, expect, it, vi } from 'vitest'
import type { SqlClient } from './db'
import {
  clearRlsContext,
  queryWithUserRls,
  runWithSystemRls,
  runWithUserRls,
  scopeSqlToRlsContext,
  setCurrentRlsUser,
} from './user-rls'

type SqlCall = {
  template: string
  values: unknown[]
}

function makeSqlMock(results: unknown[][] = [[{ ok: true }]]) {
  const txCalls: SqlCall[] = []
  const tx = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    txCalls.push({ template: strings.join('?'), values })
    return Promise.resolve([])
  }) as unknown as SqlClient
  const transaction = vi.fn(async (fn: (scoped: SqlClient) => unknown[]) => {
    const queries = fn(tx)
    return queries.map((_query, index) =>
      index === 0 ? [{ set_config: 'user_a' }] : (results[index - 1] ?? []),
    )
  })
  const sql = Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      txCalls.push({ template: strings.join('?'), values })
      return Promise.resolve([])
    }),
    { transaction },
  ) as unknown as SqlClient & { transaction: typeof transaction }

  return { sql, transaction, txCalls }
}

describe('runWithUserRls', () => {
  it('ejecuta las queries dentro de una transacción precedida por app.current_user_id', async () => {
    const { sql, transaction, txCalls } = makeSqlMock([[{ id: 'e1' }], [{ id: 'q1' }]])

    const result = await runWithUserRls(sql, 'user_a', (scoped) => [
      scoped`SELECT id FROM entities`,
      scoped`SELECT id FROM quotes`,
    ])

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(txCalls[0]?.template).toMatch(/set_config\('app\.current_user_id', \?, true\)/)
    expect(txCalls[0]?.values).toEqual(['user_a'])
    expect(txCalls[1]?.template).toBe('SELECT id FROM entities')
    expect(txCalls[2]?.template).toBe('SELECT id FROM quotes')
    expect(result).toEqual([[{ id: 'e1' }], [{ id: 'q1' }]])
  })

  it('rechaza userId vacío para no ejecutar queries con contexto RLS ambiguo', async () => {
    const { sql, transaction } = makeSqlMock()

    await expect(
      runWithUserRls(sql, '   ', (scoped) => [scoped`SELECT 1`]),
    ).rejects.toThrow(/userId requerido/)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('queryWithUserRls devuelve las filas de una sola query scoped', async () => {
    const { sql, txCalls } = makeSqlMock([[{ referenced: true }]])

    const rows = await queryWithUserRls<{ referenced: boolean }>(
      sql,
      'user_a',
      (scoped) => scoped`SELECT true AS referenced`,
    )

    expect(txCalls[0]?.template).toMatch(/set_config/)
    expect(txCalls[1]?.template).toBe('SELECT true AS referenced')
    expect(rows).toEqual([{ referenced: true }])
  })
})

describe('scopeSqlToRlsContext', () => {
  it('envuelve cada query con app.current_user_id cuando hay usuario en contexto', async () => {
    clearRlsContext()
    setCurrentRlsUser('user_a')
    const { sql, transaction, txCalls } = makeSqlMock([[{ id: 'e1' }]])
    const scoped = scopeSqlToRlsContext(sql)

    const result = await scoped`SELECT id FROM entities`

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(txCalls[0]?.template).toMatch(/set_config\('app\.current_user_id', \?, true\)/)
    expect(txCalls[0]?.values).toEqual(['user_a'])
    expect(txCalls[1]?.template).toBe('SELECT id FROM entities')
    expect(result).toEqual([{ id: 'e1' }])
    clearRlsContext()
  })

  it('preserva transacciones existentes y devuelve solo resultados de negocio', async () => {
    clearRlsContext()
    setCurrentRlsUser('user_a')
    const { sql, txCalls } = makeSqlMock([[{ id: 'e1' }], [{ id: 'q1' }]])
    const scoped = scopeSqlToRlsContext(sql)

    const result = await scoped.transaction((tx) => [
      tx`SELECT id FROM entities`,
      tx`SELECT id FROM quotes`,
    ])

    expect(txCalls[0]?.template).toMatch(/set_config\('app\.current_user_id', \?, true\)/)
    expect(txCalls[0]?.values).toEqual(['user_a'])
    expect(txCalls[1]?.template).toBe('SELECT id FROM entities')
    expect(txCalls[2]?.template).toBe('SELECT id FROM quotes')
    expect(result).toEqual([[{ id: 'e1' }], [{ id: 'q1' }]])
    clearRlsContext()
  })

  it('inyecta bypass de sistema para jobs internos multiusuario', async () => {
    clearRlsContext()
    const { sql, txCalls } = makeSqlMock([[{ user_id: 'user_a' }]])
    const scoped = scopeSqlToRlsContext(sql)

    const result = await runWithSystemRls(
      () => scoped`SELECT user_id FROM extraction_log`,
    )

    expect(txCalls[0]?.template).toMatch(/set_config\('app\.rls_bypass', \?, true\)/)
    expect(txCalls[0]?.values).toEqual(['system'])
    expect(txCalls[1]?.template).toBe('SELECT user_id FROM extraction_log')
    expect(result).toEqual([{ user_id: 'user_a' }])
    clearRlsContext()
  })

  it('no duplica set_config cuando un helper explícito recibe un SQL ya scopeado', async () => {
    clearRlsContext()
    setCurrentRlsUser('ambient_user')
    const { sql, txCalls } = makeSqlMock([[{ id: 'e1' }]])
    const scoped = scopeSqlToRlsContext(sql)

    const result = await runWithUserRls(scoped, 'explicit_user', (tx) => [
      tx`SELECT id FROM entities`,
    ])

    const configCalls = txCalls.filter((call) => /set_config\('app\./.test(call.template))
    expect(configCalls).toHaveLength(1)
    expect(configCalls[0]?.template).toMatch(
      /set_config\('app\.current_user_id', \?, true\)/,
    )
    expect(configCalls[0]?.values).toEqual(['explicit_user'])
    expect(txCalls[1]?.template).toBe('SELECT id FROM entities')
    expect(result).toEqual([[{ id: 'e1' }]])
    clearRlsContext()
  })
})
