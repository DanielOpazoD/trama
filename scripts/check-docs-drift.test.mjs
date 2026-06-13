import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkDocsDrift } from './check-docs-drift.mjs'

describe('checkDocsDrift', () => {
  it('rechaza cuando README documenta una cantidad vieja de endpoints', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trama-docs-drift-'))
    mkdirSync(join(root, 'netlify/functions'), { recursive: true })
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(join(root, 'netlify/functions/entities.mts'), 'export default {}')
    writeFileSync(join(root, 'netlify/functions/quotes.mts'), 'export default {}')
    writeFileSync(join(root, 'README.md'), '└── functions/ # 1 endpoints `.mts`')
    writeFileSync(join(root, 'docs/README.md'), '')
    writeFileSync(join(root, 'ARCHITECTURE.md'), '')
    writeFileSync(join(root, 'docs/escala.md'), '')

    const result = checkDocsDrift(root)

    expect(result.ok).toBe(false)
    expect(result.failures.map((failure) => failure.message)).toContain(
      'README.md documents 1 Netlify endpoints, but netlify/functions has 2 `.mts` files.',
    )
  })
})
