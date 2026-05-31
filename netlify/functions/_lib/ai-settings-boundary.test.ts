import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('ai-settings boundary', () => {
  it('tipa la lectura de settings IA con sqlTyped', () => {
    const src = readFileSync(join(functionsRoot, 'ai-settings.mts'), 'utf8')

    expect(src).toContain('sqlTyped<AISettingsRow>')
    expect(src).not.toContain(') as Row[]')
  })
})
