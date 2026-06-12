import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function fileLineCount(path: string): number {
  return readFileSync(resolve(process.cwd(), path), 'utf8').split('\n').length
}

describe('estructura incremental · superficies grandes', () => {
  it('mantiene los modulos grandes del cliente bajo ratchets explícitos', () => {
    const clientModules = [
      ['src/lib/demo.ts', 1150],
      ['src/components/RecortesView.tsx', 720],
      ['src/App.tsx', 720],
      ['src/components/TwitterView.tsx', 620],
      ['src/components/CommandPalette.tsx', 550],
      ['src/components/GraphView.tsx', 505],
    ] as const

    for (const [path, maxLines] of clientModules) {
      expect(fileLineCount(path), path).toBeLessThanOrEqual(maxLines)
    }
  })

  it('mantiene handlers y dispatchers grandes bajo ratchets explícitos', () => {
    const serverModules = [
      ['netlify/functions/import.mts', 700],
      ['netlify/functions/momentos.mts', 500],
      ['netlify/functions/_lib/llm/dispatch.ts', 480],
    ] as const

    for (const [path, maxLines] of serverModules) {
      expect(fileLineCount(path), path).toBeLessThanOrEqual(maxLines)
    }
  })
})
