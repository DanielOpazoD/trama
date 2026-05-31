import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('error-log boundary', () => {
  it('tipa lectura SQL del historico con sqlTyped', () => {
    const src = readFileSync(join(functionsRoot, 'error-log.mts'), 'utf8')

    expect(src).toContain('sqlTyped<Row>')
    expect(src).not.toContain(') as Row[]')
  })
})
