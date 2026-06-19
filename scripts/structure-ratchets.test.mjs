import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkStructureRatchets, fileLineCount } from './check-structure-ratchets.mjs'
import { STRUCTURE_RATCHETS } from './structure-ratchets.mjs'

const API_BOUNDARY_ENDPOINTS = [
  {
    wrapper: 'netlify/functions/recortes.mts',
    endpointImport: './_lib/recortes-endpoint.js',
    handler: 'netlify/functions/_lib/recortes-endpoint.ts',
  },
  {
    wrapper: 'netlify/functions/momentos.mts',
    endpointImport: './_lib/momentos-endpoint.js',
    handler: 'netlify/functions/_lib/momentos-endpoint.ts',
  },
  {
    wrapper: 'netlify/functions/entities.mts',
    endpointImport: './_lib/entities-endpoint.js',
    handler: 'netlify/functions/_lib/entities-endpoint.ts',
  },
  {
    wrapper: 'netlify/functions/search.mts',
    endpointImport: './_lib/search-endpoint.js',
    handler: 'netlify/functions/_lib/search-endpoint.ts',
  },
]

describe('structure ratchets', () => {
  it('cuenta líneas igual que los ratchets previos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trama-ratchet-'))
    const file = 'src/example.ts'
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, file), 'a\nb\n')

    expect(fileLineCount(file, dir)).toBe(3)
  })

  it('reporta archivos que superan su límite declarativo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trama-ratchet-'))
    const file = 'src/large.ts'
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, file), '1\n2\n3\n')

    const result = checkStructureRatchets({
      cwd: dir,
      ratchets: [{ group: 'demo', maxLines: 2, files: [file] }],
    })

    expect(result.failures).toEqual([{ file, group: 'demo', lineCount: 4, maxLines: 2 }])
    expect(result.passes).toEqual([])
  })

  it('mantiene los endpoints críticos como wrappers finos hacia _lib/*-endpoint', () => {
    for (const { wrapper, endpointImport } of API_BOUNDARY_ENDPOINTS) {
      const source = readFileSync(wrapper, 'utf8')

      expect(source).toContain("import type { Config } from '@netlify/functions'")
      expect(source).toContain(`import handler from '${endpointImport}'`)
      expect(source).toContain('export const config: Config = {')
      expect(source).toContain('path:')
      expect(source).toContain('export default handler')
      expect(source).not.toContain('export { config }')
      expect(source).not.toContain('import handler, { config }')
      expect(fileLineCount(wrapper)).toBeLessThanOrEqual(90)
    }
  })

  it('mantiene los handlers extraídos bajo observabilidad y errores canónicos', () => {
    for (const { handler } of API_BOUNDARY_ENDPOINTS) {
      const source = readFileSync(handler, 'utf8')

      expect(source).toMatch(/import \{ withObservability \} from '\.\/handler-wrap\.js'/)
      expect(source).toMatch(/import \{ ApiErrors \} from '\.\/api-error\.js'/)
      expect(source).toMatch(/export default withObservability\(/)
      expect(source).not.toMatch(/\bnew Response\s*\(/)
    }
  })

  it('declara ratchets backend para wrappers y handlers extraídos', () => {
    const entries = STRUCTURE_RATCHETS.flatMap((ratchet) =>
      ratchet.files.map((file) => ({ ...ratchet, file })),
    )
    const maxFor = (file) => entries.find((entry) => entry.file === file)?.maxLines

    for (const { wrapper } of API_BOUNDARY_ENDPOINTS) {
      expect(maxFor(wrapper)).toBeLessThanOrEqual(90)
    }
    expect(maxFor('netlify/functions/_lib/recortes-endpoint.ts')).toBeLessThanOrEqual(650)
    expect(maxFor('netlify/functions/_lib/momentos-endpoint.ts')).toBeLessThanOrEqual(560)
    expect(maxFor('netlify/functions/_lib/entities-endpoint.ts')).toBeLessThanOrEqual(480)
    expect(maxFor('netlify/functions/_lib/search-endpoint.ts')).toBeLessThanOrEqual(460)
  })
})
