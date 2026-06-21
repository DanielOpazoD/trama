import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { QUALITY_GATES } from './script-registry.mjs'

const require = createRequire(import.meta.url)
const ROOT = join(import.meta.dirname, '..')

function readRepoFile(path) {
  return readFileSync(join(ROOT, path), 'utf8')
}

describe('developer quality gates', () => {
  test('exposes Knip and dependency-cruiser as package scripts and CI gates', () => {
    const packageJson = JSON.parse(readRepoFile('package.json'))
    const workflow = readRepoFile('.github/workflows/test.yml')
    const gateCommands = new Set(QUALITY_GATES.map((gate) => gate.command))

    expect(packageJson.scripts['check:knip']).toContain('knip')
    expect(packageJson.scripts['check:architecture']).toBe(
      'node scripts/check-architecture-boundaries.mjs',
    )
    expect(readRepoFile('scripts/check-architecture-boundaries.mjs')).toContain(
      'depcruise',
    )
    expect(workflow).toContain('npm run check:knip')
    expect(workflow).toContain('npm run check:architecture')
    expect(gateCommands.has('npm run check:knip')).toBe(true)
    expect(gateCommands.has('npm run check:architecture')).toBe(true)
  })

  test('documents how to run and justify exceptions', () => {
    const docs = readRepoFile('docs/conventions/developer-quality-gates.md')
    const scriptsReadme = readRepoFile('scripts/README.md')

    expect(docs).toContain('npm run check:knip')
    expect(docs).toContain('npm run check:architecture')
    expect(docs).toContain('falso positivo')
    expect(docs).toContain('excepcion')
    expect(scriptsReadme).toContain('check:knip')
    expect(scriptsReadme).toContain('check:architecture')
  })

  test('keeps dependency-cruiser rules focused on agreed architecture boundaries', () => {
    const config = require('../.dependency-cruiser.cjs')
    const ruleNames = new Set(config.forbidden.map((rule) => rule.name))

    expect([...ruleNames]).toEqual(
      expect.arrayContaining([
        'no-circular',
        'no-client-to-netlify-functions',
        'no-client-netlify-blobs',
        'no-client-server-only-modules',
        'netlify-wrappers-delegate-to-lib',
        'no-lib-to-function-wrapper',
        'pdf-heavy-imports-through-loaders',
      ]),
    )
  })

  test('keeps Knip scoped to real Trama entrypoints and generated artifacts', () => {
    const config = JSON.parse(readRepoFile('knip.json'))

    expect(config.entry).toEqual(
      expect.arrayContaining([
        'src/main.tsx',
        'netlify/functions/**/*.mts',
        'scripts/**/*.{mjs,ts}',
        'extension/**/*.ts',
        'e2e/**/*.ts',
      ]),
    )
    expect(config.ignore).toEqual(
      expect.arrayContaining([
        'dist/**',
        'coverage/**',
        'playwright-report/**',
        'test-results/**',
      ]),
    )
  })
})
