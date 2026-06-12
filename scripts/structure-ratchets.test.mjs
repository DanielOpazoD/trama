import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkStructureRatchets, fileLineCount } from './check-structure-ratchets.mjs'

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
})
