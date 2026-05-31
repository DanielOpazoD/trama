import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('extraction-log boundary', () => {
  it('tipa lecturas SQL con sqlTyped para entries y totales', () => {
    const src = readFileSync(join(functionsRoot, 'extraction-log.mts'), 'utf8')

    expect(src).toContain('sqlTyped<Row>')
    expect(src).toContain('sqlTyped<TotalsRow>')
    expect(src).not.toContain(') as Row[]')
    expect(src).not.toContain(
      ') as Array<{ total_calls: string; total_cost_cents: string; total_tokens: string }>',
    )
  })
})
