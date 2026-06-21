import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, test } from 'vitest'

import {
  formatStorageBoundaryReport,
  validateStorageBoundaries,
} from './storage-boundaries.mjs'

function writeFixture(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content)
  }
}

describe('storage boundary contracts', () => {
  test('repo actual canaliza Netlify Blobs por el adapter compartido', () => {
    const result = validateStorageBoundaries()

    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
    expect(formatStorageBoundaryReport(result)).toContain('storage_boundaries: ok')
  })

  test('detecta imports directos de @netlify/blobs fuera del allowlist', () => {
    const root = join(tmpdir(), `trama-storage-boundary-${Date.now()}`)
    writeFixture(root, {
      'netlify/functions/_lib/storage-adapter.ts':
        "import { getStore } from '@netlify/blobs'\n",
      'netlify/functions/bad-upload.mts':
        "import { getStore } from '@netlify/blobs'\ngetStore('x')\n",
      'scripts/legacy-data-reassignment-dry-run.mjs':
        "import { getStore } from '@netlify/blobs'\ngetStore('x')\n",
      'package.json': JSON.stringify({
        scripts: { 'check:storage-boundaries': 'node scripts/storage-boundaries.mjs' },
      }),
      '.github/workflows/test.yml':
        'Storage boundaries contract\nnpm run check:storage-boundaries\n',
    })

    const result = validateStorageBoundaries({ root })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        file: 'netlify/functions/bad-upload.mts',
        message: expect.stringContaining('must use storage-adapter'),
      }),
    ])
  })
})
