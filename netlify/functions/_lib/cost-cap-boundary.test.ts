import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const libRoot = dirname(fileURLToPath(import.meta.url))

describe('cost-cap boundary', () => {
  it('tipa resultados SQL con sqlTyped en vez de casts locales', () => {
    const src = readFileSync(join(libRoot, 'cost-cap.ts'), 'utf8')

    expect(src).toContain('sqlTyped<UserBudgetRow>')
    expect(src).toContain('sqlTyped<MonthlySpendRow>')
    expect(src).not.toContain(') as Array<{ cap: number | null }>')
    expect(src).not.toContain(') as Row[]')
  })
})
