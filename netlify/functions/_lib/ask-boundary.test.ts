import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('ask boundary', () => {
  it('tipa respuestas SQL con sqlTyped en vez de casts locales', () => {
    const src = readFileSync(join(functionsRoot, 'ask.mts'), 'utf8')

    expect(src).toContain('sqlTyped<')
    expect(src).not.toContain(') as HistoryRow[]')
    expect(src).not.toContain(') as TIdRow[]')
  })
})
