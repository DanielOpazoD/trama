import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('quote-reflect boundary', () => {
  it('tipa lecturas SQL con sqlTyped en vez de casts locales', () => {
    const src = readFileSync(join(functionsRoot, 'quote-reflect.mts'), 'utf8')

    expect(src).toContain('sqlTyped<Row>')
    expect(src).toContain('sqlTyped<NeighborRow>')
    expect(src).not.toContain(') as Row[]')
    expect(src).not.toContain(') as NeighborRow[]')
  })
})
