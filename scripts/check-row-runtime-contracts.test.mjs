import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkRowRuntimeContracts } from './check-row-runtime-contracts.mjs'

async function makeRepo(files) {
  const root = await mkdtemp(join(tmpdir(), 'trama-row-contracts-'))
  for (const [relPath, source] of Object.entries(files)) {
    const file = join(root, relPath)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, source)
  }
  return root
}

const HOT_QUOTES_FILE = 'netlify/functions/quotes.mts'

describe('checkRowRuntimeContracts', () => {
  it('acepta sqlTyped<Row> crítico cuando está envuelto por parseRows con schema y context', async () => {
    const root = await makeRepo({
      [HOT_QUOTES_FILE]: `
        const rows = parseRows(
          await sqlTyped<QuoteRow>(sql\`
            SELECT id, text
            FROM quotes
          \`),
          QuoteRowSchema,
          'quotes.list'
        )
      `,
    })

    const result = checkRowRuntimeContracts({ root })

    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('falla si un archivo hot usa await sqlTyped<QuoteRow> directo', async () => {
    const root = await makeRepo({
      [HOT_QUOTES_FILE]: `
        const rows = await sqlTyped<QuoteRow>(sql\`
          SELECT id, text
          FROM quotes
        \`)
      `,
    })

    const result = checkRowRuntimeContracts({ root })

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: HOT_QUOTES_FILE,
        rowType: 'QuoteRow',
        message: expect.stringContaining('parseRows'),
      }),
    ])
  })

  it('permite rows operacionales pequeñas allowlisteadas', async () => {
    const root = await makeRepo({
      [HOT_QUOTES_FILE]: `
        const restored = await sqlTyped<{ restored: boolean }>(sql\`
          SELECT restored
        \`)
        const deleted = await sqlTyped<{ deleted_at: string }>(sql\`
          UPDATE quotes SET deleted_at = NOW() RETURNING deleted_at
        \`)
        const ids = await sqlTyped<{ id: string }>(sql\`
          SELECT id FROM quotes WHERE id = ANY($1)
        \`)
      `,
    })

    const result = checkRowRuntimeContracts({ root })

    expect(result.ok).toBe(true)
    expect(result.allowed).toHaveLength(3)
  })
})
