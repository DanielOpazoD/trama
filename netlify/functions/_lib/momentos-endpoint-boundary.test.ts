import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('momentos endpoint boundary', () => {
  it('tipa las queries SELECT con sqlTyped en vez de casts locales', () => {
    const src = readFileSync(join(functionsRoot, '_lib/momentos-endpoint.ts'), 'utf8')

    expect(src).toContain('sqlTyped<')
    expect(src).not.toContain('as MomentoListRow[]')
    expect(src).not.toContain('as MomentoEntityLinkRow[]')
    expect(src).not.toContain('as Array<Record<string, unknown>>')
  })
})
