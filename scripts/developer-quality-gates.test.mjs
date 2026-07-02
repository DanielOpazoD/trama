import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { QUALITY_GATES } from './script-registry.mjs'
import { QUALITY_GATE_BASELINE } from './quality-gates-baseline.mjs'
import {
  buildQualityGatesReport,
  formatQualityGatesReport,
} from './report-quality-gates.mjs'

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
    expect(packageJson.scripts['check:dead-code']).toBe(packageJson.scripts['check:knip'])
    expect(packageJson.scripts['check:architecture']).toBe(
      'node scripts/check-architecture-boundaries.mjs',
    )
    expect(packageJson.scripts['check:dependency-cruiser']).toBe(
      packageJson.scripts['check:architecture'],
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
    expect(scriptsReadme).toContain('check:dead-code')
    expect(scriptsReadme).toContain('check:architecture')
    expect(scriptsReadme).toContain('check:dependency-cruiser')
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

  test('keeps the Knip baseline intentionally small', () => {
    const config = JSON.parse(readRepoFile('knip.json'))
    const ignoredIssueFiles = Object.keys(config.ignoreIssues ?? {})
    const ignoredIssueKinds = Object.values(config.ignoreIssues ?? {}).reduce(
      (total, issues) => total + issues.length,
      0,
    )

    expect(ignoredIssueFiles.length).toBeLessThanOrEqual(
      QUALITY_GATE_BASELINE.knip.ignoreIssueFiles,
    )
    expect(ignoredIssueKinds).toBeLessThanOrEqual(
      QUALITY_GATE_BASELINE.knip.ignoreIssueKinds,
    )
    expect((config.ignoreFiles ?? []).length).toBeLessThanOrEqual(
      QUALITY_GATE_BASELINE.knip.ignoreFiles,
    )
    expect((config.ignoreDependencies ?? []).length).toBeLessThanOrEqual(
      QUALITY_GATE_BASELINE.knip.ignoreDependencies,
    )
    expect((config.ignoreBinaries ?? []).length).toBeLessThanOrEqual(
      QUALITY_GATE_BASELINE.knip.ignoreBinaries,
    )
  })

  test('does not park removable state hook exports in the Knip baseline', () => {
    const config = JSON.parse(readRepoFile('knip.json'))
    const ignoredFiles = Object.keys(config.ignoreIssues ?? {})

    expect(ignoredFiles).not.toContain('src/state/useReadingTables.ts')
    expect(ignoredFiles).not.toContain('src/state/useSavedQueries.ts')
  })

  test('exposes a quality gates evidence report', () => {
    const packageJson = JSON.parse(readRepoFile('package.json'))
    const docs = readRepoFile('docs/conventions/developer-quality-gates.md')
    const scriptsReadme = readRepoFile('scripts/README.md')
    const registryEntry = QUALITY_GATES.find(
      (gate) => gate.command === 'npm run report:quality-gates',
    )

    expect(packageJson.scripts['report:quality-gates']).toBe(
      'node scripts/report-quality-gates.mjs',
    )
    expect(readRepoFile('scripts/report-quality-gates.mjs')).toContain(
      'QUALITY_GATE_BASELINE',
    )
    expect(registryEntry).toMatchObject({ phase: 'operations', required: false })
    expect(docs).toContain('npm run report:quality-gates')
    expect(scriptsReadme).toContain('report:quality-gates')
  })

  test('classifies remaining Knip exceptions by domain', () => {
    const report = buildQualityGatesReport()
    const formatted = formatQualityGatesReport(report)

    expect(report.knip.ignoreIssueDomains).toEqual([
      { name: 'pdf-studio-contracts', files: 10, kinds: 10 },
      { name: 'api-contracts', files: 11, kinds: 11 },
      { name: 'component-contracts', files: 1, kinds: 1 },
      { name: 'shared-lib-contracts', files: 4, kinds: 4 },
      { name: 'state-contracts', files: 4, kinds: 5 },
      { name: 'shared-domain-types', files: 3, kinds: 3 },
    ])
    expect(formatted).toContain('Knip ignoreIssue domains:')
    expect(formatted).toContain('api-contracts: 11 files, 11 kinds')
    expect(formatted).toContain('state-contracts: 4 files, 5 kinds')
    expect(formatted).toContain('component-contracts: 1 file, 1 kind')
  })

  test('does not keep resolved Sidebar cycles in the dependency-cruiser baseline', () => {
    const baseline = JSON.parse(readRepoFile('.dependency-cruiser-known-violations.json'))
    const cycleKeys = baseline.knownViolations.map(
      (violation) => `${violation.from} -> ${violation.to}`,
    )

    expect(cycleKeys).not.toContain(
      'src/components/Sidebar.tsx -> src/components/sidebar/NavButton.tsx',
    )
    expect(cycleKeys).not.toContain('src/components/Sidebar.tsx -> src/lib/navigation.ts')
    expect(cycleKeys).not.toContain(
      'src/components/Sidebar.tsx -> src/lib/sectionAccent.ts',
    )
    expect(cycleKeys).not.toContain(
      'src/components/TopBar.tsx -> src/components/WorldSwitcher.tsx',
    )
  })

  test('keeps the dependency-cruiser cycle baseline empty', () => {
    const baseline = JSON.parse(readRepoFile('.dependency-cruiser-known-violations.json'))

    expect(baseline.knownViolations).toEqual([])
    expect(baseline.knownViolations).toHaveLength(
      QUALITY_GATE_BASELINE.dependencyCruiser.knownViolations,
    )
  })
})
