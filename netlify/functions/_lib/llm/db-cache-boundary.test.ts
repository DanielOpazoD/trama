import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const llmRoot = dirname(fileURLToPath(import.meta.url))

describe('llm db-cache boundary', () => {
  it('tipa resultados SQL con sqlTyped en vez de casts locales', () => {
    const src = readFileSync(join(llmRoot, 'db-cache.ts'), 'utf8')

    expect(src).toContain('sqlTyped<DbRow>')
    expect(src).toContain('sqlTyped<ExpiredCacheRow>')
    expect(src).not.toContain(') as DbRow[]')
    expect(src).not.toContain(') as Array<{ hash: string }>')
  })
})
