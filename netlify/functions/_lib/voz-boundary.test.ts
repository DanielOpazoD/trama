import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('voz endpoint boundary', () => {
  it('tipa lecturas SQL con sqlTyped en vez de casts locales', () => {
    const src = readFileSync(join(functionsRoot, 'voz.mts'), 'utf8')

    expect(src).toContain('sqlTyped<EntityRow>')
    expect(src).toContain('sqlTyped<QuoteRow>')
    expect(src).not.toContain(') as EntityRow[]')
    expect(src).not.toContain(') as QuoteRow[]')
  })
})
