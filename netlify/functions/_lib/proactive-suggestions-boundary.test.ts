import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('proactive-suggestions boundary', () => {
  it('tipa filas SQL de sugerencias con sqlTyped y un mapper compartido', () => {
    const src = readFileSync(join(functionsRoot, 'proactive-suggestions.mts'), 'utf8')

    expect(src).toContain('sqlTyped<SuggestionRow>')
    expect(src).toContain('function suggestionFromRow')
    expect(src).not.toContain(') as Row[]')
    expect(src).not.toContain(') as Array<{')
    expect(src).not.toContain('})) as Suggestion[]')
  })
})
