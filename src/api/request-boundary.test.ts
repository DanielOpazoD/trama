import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = join(__dirname, '../..')
const srcRoot = join(repoRoot, 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const file = join(dir, entry)
    const stat = statSync(file)
    if (stat.isDirectory()) return sourceFiles(file)
    if (!/\.(ts|tsx)$/.test(file)) return []
    if (/\.test\.(ts|tsx)$/.test(file)) return []
    return [file]
  })
}

describe('client API boundary', () => {
  it('tipa el puente legacy de Clerk sin castear window localmente', () => {
    const text = readFileSync(join(srcRoot, 'api', 'request.ts'), 'utf8')

    expect(text).not.toContain('(window as unknown as ClerkWindow)')
    expect(text).toContain('interface Window')
  })

  it('centraliza fetch("/api…") en src/api/request.ts', () => {
    const offenders = sourceFiles(srcRoot)
      .filter((file) => !file.endsWith(join('src', 'api', 'request.ts')))
      .flatMap((file) => {
        const text = readFileSync(file, 'utf8')
        const hasDirectApiFetch = /fetch\(\s*['"`]\/api/.test(text)
        return hasDirectApiFetch ? [relative(repoRoot, file)] : []
      })

    expect(offenders).toEqual([])
  })
})
