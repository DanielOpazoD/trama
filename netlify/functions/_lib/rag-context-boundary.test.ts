import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../..')

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

describe('guardrail: RAG context usa el tipo SQL canonico', () => {
  it('los callers pasan sql a buildRagContext sin casts locales', () => {
    for (const path of [
      'netlify/functions/ask.mts',
      'netlify/functions/_lib/chat-context.ts',
    ]) {
      const src = readRepoFile(path)

      expect(src).not.toMatch(/buildRagContext\(\s*\n\s*sql\s+as\s+unknown\s+as/)
    }
  })
})
