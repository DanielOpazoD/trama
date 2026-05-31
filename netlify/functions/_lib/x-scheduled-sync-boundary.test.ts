import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('x-scheduled-sync boundary', () => {
  it('tipa la lectura SQL de tokens por usuario con sqlTyped', () => {
    const src = readFileSync(join(functionsRoot, 'x-scheduled-sync.mts'), 'utf8')

    expect(src).toContain('sqlTyped<XTokenUserRow>')
    expect(src).not.toContain(') as Array<{ user_id: string; x_user_id: string | null }>')
  })
})
