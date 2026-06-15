import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkFrontendBoundaries } from './check-frontend-boundaries.mjs'

describe('checkFrontendBoundaries', () => {
  it('rechaza view models de componentes que importan React o state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trama-frontend-boundaries-'))
    mkdirSync(join(root, 'src/components'), { recursive: true })
    writeFileSync(
      join(root, 'src/components/exampleViewModel.ts'),
      [
        "import { useMemo } from 'react'",
        "import { useEntitiesQuery } from '../state'",
        'export const value = 1',
      ].join('\n'),
    )

    const result = checkFrontendBoundaries(root)

    expect(result.ok).toBe(false)
    expect(result.failures.map((failure) => failure.message)).toEqual([
      'src/components/exampleViewModel.ts imports react; component view models must stay pure.',
      'src/components/exampleViewModel.ts imports ../state; component view models must not consume app state.',
    ])
  })

  it('permite imports type-only desde api para compartir contratos', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trama-frontend-boundaries-'))
    mkdirSync(join(root, 'src/components'), { recursive: true })
    writeFileSync(
      join(root, 'src/components/exampleViewModel.ts'),
      ["import type { XBookmark } from '../api'", 'export const value = 1'].join('\n'),
    )

    expect(checkFrontendBoundaries(root)).toEqual({ ok: true, failures: [] })
  })
})
