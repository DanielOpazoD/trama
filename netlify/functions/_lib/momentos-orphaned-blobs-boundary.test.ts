import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('momentos-orphaned-blobs boundary', () => {
  it('tipa respuestas SQL con sqlTyped en vez de casts locales', () => {
    const src = readFileSync(join(functionsRoot, 'momentos-orphaned-blobs.mts'), 'utf8')

    expect(src).toContain('sqlTyped<')
    expect(src).not.toContain(') as Array<{ payload: FotoPayload | null }>')
    expect(src).not.toContain(') as Array<Record<string, unknown>>')
  })
})
