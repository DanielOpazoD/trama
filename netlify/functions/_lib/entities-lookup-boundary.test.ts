import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('entities-lookup boundary', () => {
  it('tipa las tres ramas SQL con sqlTyped', () => {
    const src = readFileSync(join(functionsRoot, 'entities-lookup.mts'), 'utf8')

    expect(src).toContain('sqlTyped<EntityLookupRow>')
    expect(src).not.toContain('let rows: unknown[]')
    expect(src).not.toContain(') as unknown[]')
  })
})
