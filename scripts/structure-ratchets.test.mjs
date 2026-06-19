import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkStructureRatchets, fileLineCount } from './check-structure-ratchets.mjs'
import { STRUCTURE_RATCHETS } from './structure-ratchets.mjs'

const API_BOUNDARY_ENDPOINTS = [
  ['netlify/functions/recortes.mts', './_lib/recortes-endpoint.js'],
  ['netlify/functions/momentos.mts', './_lib/momentos-endpoint.js'],
  ['netlify/functions/entities.mts', './_lib/entities-endpoint.js'],
  ['netlify/functions/search.mts', './_lib/search-endpoint.js'],
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
    for (const [file, endpointImport] of API_BOUNDARY_ENDPOINTS) {
      const source = readFileSync(file, 'utf8')

      expect(source).toContain(endpointImport)
      expect(fileLineCount(file)).toBeLessThanOrEqual(90)
    }
  })

  it('declara ratchets backend para wrappers y handlers extraídos', () => {
    const entries = STRUCTURE_RATCHETS.flatMap((ratchet) =>
      ratchet.files.map((file) => ({ ...ratchet, file })),
    )
    const maxFor = (file) => entries.find((entry) => entry.file === file)?.maxLines

    for (const [file] of API_BOUNDARY_ENDPOINTS) {
      expect(maxFor(file)).toBeLessThanOrEqual(90)
    }
    expect(maxFor('netlify/functions/_lib/recortes-endpoint.ts')).toBeLessThanOrEqual(650)
    expect(maxFor('netlify/functions/_lib/momentos-endpoint.ts')).toBeLessThanOrEqual(560)
    expect(maxFor('netlify/functions/_lib/entities-endpoint.ts')).toBeLessThanOrEqual(480)
    expect(maxFor('netlify/functions/_lib/search-endpoint.ts')).toBeLessThanOrEqual(460)
  })
})
