import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  HOT_ROW_CONTRACT_FILES,
  checkRowRuntimeContracts,
} from './check-row-runtime-contracts.mjs'

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
  it('incluye helpers splitteados de endpoints hot para no perder cobertura', () => {
    expect(HOT_ROW_CONTRACT_FILES).toContain(
      'netlify/functions/_lib/search-endpoint-queries.ts',
    )
  })

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

  it('acepta sqlTyped<Row> crítico cuando una rama concurrente parsea rows en .then', async () => {
    const root = await makeRepo({
      [HOT_QUOTES_FILE]: `
        const queries = [
          sqlTyped<QuoteRow>(sql\`
            SELECT id, text
            FROM quotes
          \`).then((rows) => parseRows(rows, QuoteRowSchema, 'quotes.list'))
        ]
      `,
    })

    const result = checkRowRuntimeContracts({ root })

    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('falla si .then parsea un valor distinto al resultado de sqlTyped<Row>', async () => {
    const root = await makeRepo({
      [HOT_QUOTES_FILE]: `
        const queries = [
          sqlTyped<QuoteRow>(sql\`
            SELECT id, text
            FROM quotes
          \`).then((rows) => parseRows(otherRows, QuoteRowSchema, 'quotes.list'))
        ]
      `,
    })

    const result = checkRowRuntimeContracts({ root })

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: HOT_QUOTES_FILE,
        rowType: 'QuoteRow',
      }),
    ])
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

  it('falla si un archivo hot usa un genérico no allowlisteado aunque no termine en Row', async () => {
    const root = await makeRepo({
      [HOT_QUOTES_FILE]: `
        const rows = await sqlTyped<MyQuote>(sql\`
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
        rowType: 'MyQuote',
        message: expect.stringContaining('parseRows'),
      }),
    ])
  })

  it('falla con objetos inline no allowlisteados en archivos hot', async () => {
    const root = await makeRepo({
      [HOT_QUOTES_FILE]: `
        const rows = await sqlTyped<{
          text: string
          source: string | null
          context: string | null
        }>(sql\`
          SELECT text, source, context
          FROM quotes
        \`)
      `,
    })

    const result = checkRowRuntimeContracts({ root })

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: HOT_QUOTES_FILE,
        rowType: expect.stringContaining('text: string'),
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
