import { describe, expect, it, vi } from 'vitest'
import type { SqlClient } from './db'
import { queryWithUserRls, runWithUserRls } from './user-rls'

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
