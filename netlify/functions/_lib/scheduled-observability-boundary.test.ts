import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('scheduled functions observability boundary', () => {
  const scheduled = [
    ['cost-alert-check.mts', 'cost-alert-check'],
    ['spotify-scheduled-sync.mts', 'spotify-scheduled-sync'],
    ['x-scheduled-sync.mts', 'x-scheduled-sync'],
  ] as const

  for (const [file, name] of scheduled) {
    it(`${file} usa withObservability y requestId del wrapper`, () => {
      const src = readFileSync(join(functionsRoot, file), 'utf8')

      expect(src).toContain("import { withObservability } from './_lib/handler-wrap.js'")
      expect(src).toMatch(new RegExp(`export default withObservability\\(\\s*'${name}'`))
      expect(src).not.toContain('crypto.randomUUID()')
    })
  }
})
