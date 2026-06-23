import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const STATE_DIR = 'src/state'
const REPO_ROOT = process.cwd()

function source(file: string, base = STATE_DIR): string {
  return readFileSync(join(base, file), 'utf8')
}

function uncommented(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')
}

function directInvalidationLines(file: string): string[] {
  const src = uncommented(readFileSync(join(REPO_ROOT, file), 'utf8'))
  return src
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('invalidateQueries('))
}

describe('cache contract guardrail', () => {
  it('mantiene los hooks objetivo conectados a cacheInvalidation', () => {
    for (const file of [
      'useNotes.ts',
      'useRecortes.ts',
      'useMomentos.ts',
      'useNotasAttachments.ts',
      'useEntities.ts',
      'useQuotes.ts',
      'useRelationships.ts',
      'useTasks.ts',
    ]) {
      expect(source(file), file).toContain("from './cacheInvalidation'")
    }
  })

  it('evita que Notas, Recortes y attachments vuelvan a invalidar superficies críticas a mano', () => {
    const forbiddenDirectInvalidation =
      /invalidateQueries\(\{\s*queryKey:\s*queryKeys\.(notes|notasFeed|recortes|quotes|quotesInfinite|entities|momentosInfinite|counts|home|notasAttachments|tasks|search)\b/

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

  it('evita que core graph vuelva a duplicar invalidaciones transversales a mano', () => {
    const forbiddenDirectInvalidation =
      /invalidateQueries\(\{\s*queryKey:\s*queryKeys\.(entities|relationships|quotes|counts|entityRefsCount|entitiesInfinite|relationshipsInfinite|quotesInfinite|momentosInfinite|home|atlas|cronologiaInfinite)\b/

    for (const file of ['useEntities.ts', 'useQuotes.ts', 'useRelationships.ts']) {
      expect(uncommented(source(file)), file).not.toMatch(forbiddenDirectInvalidation)
    }
  })

  it('evita que tareas vuelva a duplicar invalidaciones de calendario e inicio a mano', () => {
    const src = uncommented(source('useTasks.ts'))

    expect(src).not.toMatch(
      /invalidateQueries\(\{\s*queryKey:\s*(TASKS_KEY|queryKeys\.(tasks|cronologiaInfinite|home))\b/,
    )
  })

  it('mantiene el rollback optimista común en los hooks con patches optimistas', () => {
    expect(source('useNotes.ts')).toContain("from './cacheOptimistic'")
    expect(source('useRecortes.ts')).toContain("from './cacheOptimistic'")
    expect(source('notasFeedCache.ts')).toContain("from './cacheOptimistic'")
    expect(source('useEntities.ts')).toContain("from './cacheOptimistic'")
    expect(source('useQuotes.ts')).toContain("from './cacheOptimistic'")
    expect(source('useRelationships.ts')).toContain("from './cacheOptimistic'")
    expect(source('useTasks.ts')).toContain("from './cacheOptimistic'")
  })

  it('restringe invalidateQueries directo a excepciones explícitas', () => {
    const allowedDirectInvalidations: Record<string, RegExp[]> = {
      'src/state/cacheInvalidation.ts': [/queryClient\.invalidateQueries/],
      'src/state/useMomentos.ts': [
        /queryKeys\.momentoShareInvitations/,
        /queryKeys\.momentoFeedback\(momentoId\)/,
      ],
      'src/state/useExportImport.ts': [
        /queryKeys\.(entities|relationships|quotes|momentosInfinite|notes|tasks|home|cronologiaInfinite|atlas)/,
      ],
      'src/components/recortes/RecorteSelectionBar.tsx': [
        /queryKeys\.(recortes|notasFeed|search|momentosInfinite|counts|home)/,
      ],
    }

    for (const [file, allowed] of Object.entries(allowedDirectInvalidations)) {
      const unexpected = directInvalidationLines(file).filter(
        (line) => !allowed.some((pattern) => pattern.test(line)),
      )
      expect(unexpected, file).toEqual([])
    }
  })
})
