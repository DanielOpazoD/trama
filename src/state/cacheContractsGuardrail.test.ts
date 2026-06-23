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

const forbiddenNotesRecortesAttachmentsInvalidation =
  /invalidateQueries\(\s*\{[^)]*?\bqueryKey:\s*queryKeys\.(notes|notasFeed|recortes|quotes|quotesInfinite|entities|momentosInfinite|counts|home|notasAttachments|tasks|search)\b/

const forbiddenMomentosInvalidation =
  /invalidateQueries\(\s*\{[^)]*?\bqueryKey:\s*(MOMENTOS_INFINITE|queryKeys\.(home|cronologiaInfinite|atlas|momentoShareAccess))\b/

const forbiddenCoreGraphInvalidation =
  /invalidateQueries\(\s*\{[^)]*?\bqueryKey:\s*queryKeys\.(entities|relationships|quotes|counts|entityRefsCount|entitiesInfinite|relationshipsInfinite|quotesInfinite|momentosInfinite|home|atlas|cronologiaInfinite)\b/

const forbiddenTasksInvalidation =
  /invalidateQueries\(\s*\{[^)]*?\bqueryKey:\s*(TASKS_KEY|queryKeys\.(tasks|cronologiaInfinite|home))\b/

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
    for (const file of ['useNotes.ts', 'useRecortes.ts', 'useNotasAttachments.ts']) {
      expect(uncommented(source(file)), file).not.toMatch(
        forbiddenNotesRecortesAttachmentsInvalidation,
      )
    }
  })

  it('evita que Momentos vuelva a duplicar invalidaciones de timeline/share access', () => {
    const src = uncommented(source('useMomentos.ts'))

    expect(src).not.toMatch(forbiddenMomentosInvalidation)
  })

  it('evita que core graph vuelva a duplicar invalidaciones transversales a mano', () => {
    for (const file of ['useEntities.ts', 'useQuotes.ts', 'useRelationships.ts']) {
      expect(uncommented(source(file)), file).not.toMatch(forbiddenCoreGraphInvalidation)
    }
  })

  it('evita que tareas vuelva a duplicar invalidaciones de calendario e inicio a mano', () => {
    const src = uncommented(source('useTasks.ts'))

    expect(src).not.toMatch(forbiddenTasksInvalidation)
  })

  it('detecta invalidaciones manuales aunque queryKey no sea la primera opcion', () => {
    expect(
      'queryClient.invalidateQueries({ exact: true, queryKey: queryKeys.notes })',
    ).toMatch(forbiddenNotesRecortesAttachmentsInvalidation)
    expect(
      'queryClient.invalidateQueries({ refetchType: "active", queryKey: MOMENTOS_INFINITE })',
    ).toMatch(forbiddenMomentosInvalidation)
    expect(
      'queryClient.invalidateQueries({ exact: true, queryKey: queryKeys.entities })',
    ).toMatch(forbiddenCoreGraphInvalidation)
    expect('queryClient.invalidateQueries({ exact: true, queryKey: TASKS_KEY })').toMatch(
      forbiddenTasksInvalidation,
    )
  })

  it('mantiene el rollback optimista común en los hooks con patches optimistas', () => {
    for (const file of [
      'useNotes.ts',
      'useRecortes.ts',
      'notasFeedCache.ts',
      'useEntities.ts',
      'useQuotes.ts',
      'useRelationships.ts',
      'useTasks.ts',
    ]) {
      expect(uncommented(source(file)), file).toMatch(/from ['"]\.\/cacheOptimistic['"]/)
    }
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
