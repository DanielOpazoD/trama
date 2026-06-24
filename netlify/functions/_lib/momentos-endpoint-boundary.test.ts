import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('momentos endpoint boundary', () => {
  it('tipa las queries SELECT con sqlTyped en vez de casts locales', () => {
    // El acceso a datos se extrajo a _lib/momentos/data.ts; ahí viven las
    // queries y debe sostenerse el invariante. El endpoint orquesta y tampoco
    // debe reintroducir casts locales.
    const data = readFileSync(join(functionsRoot, '_lib/momentos/data.ts'), 'utf8')
    const endpoint = readFileSync(
      join(functionsRoot, '_lib/momentos-endpoint.ts'),
      'utf8',
    )

    expect(data).toContain('sqlTyped<')
    for (const src of [data, endpoint]) {
      expect(src).not.toContain('as MomentoListRow[]')
      expect(src).not.toContain('as MomentoEntityLinkRow[]')
      expect(src).not.toContain('as Array<Record<string, unknown>>')
    }
  })
})
