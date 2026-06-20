import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

import {
  findScriptRegistryIssues,
  findUnsafeCliEntrypointIssues,
} from './check-script-registry.mjs'
import { QUALITY_GATES, SCRIPT_REGISTRY } from './script-registry.mjs'

function fixtureRoot(files) {
  const root = mkdtempSync(join(tmpdir(), 'trama-script-registry-'))
  for (const [file, contents] of Object.entries(files)) {
    const fullPath = join(root, file)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, contents)
  }
  return root
}

const minimalPackage = {
  scripts: {
    'check:known': 'node scripts/known.mjs',
  },
}

const minimalWorkflow = `
name: test
jobs:
  lint:
    steps:
      - name: Known gate
        run: npm run check:known
`

describe('script registry contract', () => {
  test('flags operational scripts that are not registered', () => {
    const root = fixtureRoot({
      'package.json': JSON.stringify(minimalPackage),
      '.github/workflows/test.yml': minimalWorkflow,
      'scripts/known.mjs': 'export const known = true',
      'scripts/missing.mjs': 'export const missing = true',
    })

    expect(
      findScriptRegistryIssues(root, {
        registry: [
          {
            file: 'scripts/known.mjs',
            domain: 'ci',
            kind: 'check',
            critical: true,
            packageScripts: ['check:known'],
            summary: 'Known check.',
          },
        ],
        qualityGates: [
          {
            command: 'npm run check:known',
            job: 'lint',
            phase: 'static',
            required: true,
            summary: 'Known gate.',
          },
        ],
      }),
    ).toContainEqual({
      code: 'script-unregistered',
      file: 'scripts/missing.mjs',
      message: 'Operational script is not listed in SCRIPT_REGISTRY.',
    })
  })

  test('flags package commands whose script file entry does not list the npm command', () => {
    const root = fixtureRoot({
      'package.json': JSON.stringify({
        scripts: {
          'check:known': 'node scripts/known.mjs',
          'check:undocumented': 'node scripts/known.mjs',
        },
      }),
      '.github/workflows/test.yml': minimalWorkflow,
      'scripts/known.mjs': 'export const known = true',
    })

    expect(
      findScriptRegistryIssues(root, {
        registry: [
          {
            file: 'scripts/known.mjs',
            domain: 'ci',
            kind: 'check',
            critical: true,
            packageScripts: ['check:known'],
            summary: 'Known check.',
          },
        ],
        qualityGates: [
          {
            command: 'npm run check:known',
            job: 'lint',
            phase: 'static',
            required: true,
            summary: 'Known gate.',
          },
        ],
      }),
    ).toContainEqual({
      code: 'package-command-undocumented',
      command: 'check:undocumented',
      file: 'scripts/known.mjs',
      message:
        'package.json command invokes a script file not linked from its registry entry.',
    })
  })

  test('flags workflow npm gates that are not documented in QUALITY_GATES', () => {
    const root = fixtureRoot({
      'package.json': JSON.stringify(minimalPackage),
      '.github/workflows/test.yml': `
name: test
jobs:
  lint:
    steps:
      - name: Undocumented gate
        run: npm run check:known
`,
      'scripts/known.mjs': 'export const known = true',
    })

    expect(
      findScriptRegistryIssues(root, {
        registry: [
          {
            file: 'scripts/known.mjs',
            domain: 'ci',
            kind: 'check',
            critical: true,
            packageScripts: ['check:known'],
            summary: 'Known check.',
          },
        ],
        qualityGates: [],
      }),
    ).toContainEqual({
      code: 'workflow-gate-undocumented',
      command: 'npm run check:known',
      file: '.github/workflows/test.yml',
      message: 'Workflow command is not listed in QUALITY_GATES.',
    })
  })

  test('flags registry npm commands that no longer exist in package.json', () => {
    const root = fixtureRoot({
      'package.json': JSON.stringify({ scripts: {} }),
      '.github/workflows/test.yml': '',
      'scripts/known.mjs': 'export const known = true',
    })

    expect(
      findScriptRegistryIssues(root, {
        registry: [
          {
            file: 'scripts/known.mjs',
            domain: 'ci',
            kind: 'check',
            critical: true,
            packageScripts: ['check:missing'],
            summary: 'Known check.',
          },
        ],
        qualityGates: [],
      }),
    ).toContainEqual({
      code: 'registry-package-command-missing',
      command: 'check:missing',
      file: 'scripts/known.mjs',
      message: 'Registry entry links to a package.json command that does not exist.',
    })
  })

  test('detects pathToFileURL(process.argv[1]) without an argv guard', () => {
    const root = fixtureRoot({
      'scripts/unsafe.mjs': `
import { pathToFileURL } from 'node:url'
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('unsafe')
}
`,
      'scripts/safe.mjs': `
import { pathToFileURL } from 'node:url'
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('safe')
}
`,
    })

    expect(findUnsafeCliEntrypointIssues(root)).toEqual([
      {
        code: 'unguarded-path-to-file-url',
        file: 'scripts/unsafe.mjs',
        line: 3,
        message: 'Guard process.argv[1] before passing it to pathToFileURL().',
      },
    ])
  })

  test('current repository registry is internally consistent', () => {
    expect(
      findScriptRegistryIssues(process.cwd(), {
        registry: SCRIPT_REGISTRY,
        qualityGates: QUALITY_GATES,
      }),
    ).toEqual([])
    expect(findUnsafeCliEntrypointIssues(process.cwd())).toEqual([])
  })
})
