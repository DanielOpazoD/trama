import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const functionsRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('x-status boundary', () => {
  it('tipa el conteo SQL de bookmarks con sqlTyped', () => {
    const src = readFileSync(join(functionsRoot, 'x-status.mts'), 'utf8')

    expect(src).toContain('sqlTyped<BookmarkCountRow>')
    expect(src).not.toContain(') as Array<{ c: number }>')
  })
})
