import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('catalog type endpoints boundary', () => {
  it('tipa conteos de uso con sqlTyped en entity-types', () => {
    const src = readFileSync(join(functionsRoot, 'entity-types.mts'), 'utf8')

    expect(src).toContain('sqlTyped<UsageRow>')
    expect(src).not.toContain(') as Array<{ n: string }>')
  })

  it('tipa conteos de uso con sqlTyped en relationship-types', () => {
    const src = readFileSync(join(functionsRoot, 'relationship-types.mts'), 'utf8')

    expect(src).toContain('sqlTyped<UsageRow>')
    expect(src).not.toContain(') as Array<{ n: string }>')
  })
})
