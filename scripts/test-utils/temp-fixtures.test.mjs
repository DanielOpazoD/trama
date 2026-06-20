import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { makeTempFixtureRoot } from './temp-fixtures.mjs'

describe('script temp fixture helpers', () => {
  test('writes nested files and exposes their isolated root', () => {
    const fixture = makeTempFixtureRoot('script-contract-', {
      'package.json': JSON.stringify({ scripts: { check: 'node scripts/check.mjs' } }),
      'scripts/check.mjs': 'export const ok = true',
      '.github/workflows/test.yml': 'name: test\n',
    })

    expect(existsSync(join(fixture.root, 'scripts/check.mjs'))).toBe(true)
    expect(readFileSync(join(fixture.root, 'package.json'), 'utf8')).toContain('"check"')
  })

  test('rejects fixture paths that escape the temporary root', () => {
    expect(() =>
      makeTempFixtureRoot('script-contract-', {
        '../escape.mjs': 'export const escaped = true',
      }),
    ).toThrow(/outside fixture root/)
  })
})
