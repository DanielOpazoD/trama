import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const STATE_DIR = 'src/state'

function source(file: string): string {
  return readFileSync(join(STATE_DIR, file), 'utf8')
}

function uncommented(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')
}

describe('cache contract guardrail', () => {
  it('mantiene los hooks objetivo conectados a cacheInvalidation', () => {
    for (const file of [
      'useNotes.ts',
      'useRecortes.ts',
      'useMomentos.ts',
      'useNotasAttachments.ts',
    ]) {
      expect(source(file), file).toContain("from './cacheInvalidation'")
    }
  })

  it('evita que Notas, Recortes y attachments vuelvan a invalidar superficies críticas a mano', () => {
    const forbiddenDirectInvalidation =
      /invalidateQueries\(\{\s*queryKey:\s*queryKeys\.(notes|notasFeed|recortes|quotes|quotesInfinite|entities|momentosInfinite|counts|home|notasAttachments|tasks)\b/

    for (const file of ['useNotes.ts', 'useRecortes.ts', 'useNotasAttachments.ts']) {
      expect(uncommented(source(file)), file).not.toMatch(forbiddenDirectInvalidation)
    }
  })

  it('evita que Momentos vuelva a duplicar invalidaciones de timeline/share access', () => {
    const src = uncommented(source('useMomentos.ts'))

    expect(src).not.toMatch(
      /invalidateQueries\(\{\s*queryKey:\s*(MOMENTOS_INFINITE|queryKeys\.(home|cronologiaInfinite|atlas|momentoShareAccess))\b/,
    )
  })

  it('mantiene el rollback optimista común en los hooks con patches optimistas', () => {
    expect(source('useNotes.ts')).toContain("from './cacheOptimistic'")
    expect(source('useRecortes.ts')).toContain("from './cacheOptimistic'")
    expect(source('notasFeedCache.ts')).toContain("from './cacheOptimistic'")
  })
})
