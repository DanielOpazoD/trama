import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('entities boundary', () => {
  it('tipa respuestas SQL con sqlTyped en vez de casts locales', () => {
    const src = readFileSync(join(functionsRoot, '_lib/entities-endpoint.ts'), 'utf8')

    expect(src).toContain('sqlTyped<DupRow>')
    expect(src).toContain('sqlTyped<EntityRow>')
    expect(src).not.toContain(') as DupRow[]')
    expect(src).not.toContain('rows as Array<{ id: string; created_at:')
  })
})
