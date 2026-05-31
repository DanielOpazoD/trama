import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const libRoot = dirname(fileURLToPath(import.meta.url))

describe('ai-tasks boundary', () => {
  it('tipa la carga de providers por usuario con sqlTyped', () => {
    const src = readFileSync(join(libRoot, 'ai-tasks.ts'), 'utf8')

    expect(src).toContain('sqlTyped<TaskProviderRow>')
    expect(src).not.toContain(') as Row[]')
  })
})
