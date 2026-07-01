import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  collectPdfRuntimeInventory,
  summarizePdfRuntimeInventory,
} from './pdf-runtime-inventory.mjs'

function write(root, file, source) {
  const path = join(root, file)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, source)
}

describe('PDF runtime inventory', () => {
  it('classifies loader, consumer, direct runtime, type-only and test imports', () => {
    const root = mkdtempSync(join(tmpdir(), 'trama-pdf-runtime-inventory-'))
    write(
      root,
      'src/lib/pdfStudio/pdfRuntime/pdfLibLoader.ts',
      "export const load = () => import('pdf-lib')\n",
    )
    write(
      root,
      'src/lib/pdfStudio/assemble/types.ts',
      "import type { PDFDocument } from 'pdf-lib'\n",
    )
    write(
      root,
      'src/lib/pdfStudio/forms/bad.ts',
      "import { PDFDocument } from 'pdf-lib'\n",
    )
    write(
      root,
      'src/lib/pdfStudio/render/render.ts',
      "import { loadPdfjsDocument } from '../pdfRuntime/pdfjsLoader'\n",
    )
    write(
      root,
      'src/lib/pdfStudio/assemble/assemble.test.ts',
      "vi.mock('pdfjs-dist', () => ({}))\n",
    )

    const inventory = collectPdfRuntimeInventory({ root })

    expect(inventory.imports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/lib/pdfStudio/pdfRuntime/pdfLibLoader.ts',
          kind: 'loader-runtime',
          specifier: 'pdf-lib',
        }),
        expect.objectContaining({
          file: 'src/lib/pdfStudio/assemble/types.ts',
          kind: 'type-only',
          specifier: 'pdf-lib',
        }),
        expect.objectContaining({
          file: 'src/lib/pdfStudio/forms/bad.ts',
          kind: 'direct-runtime',
          specifier: 'pdf-lib',
        }),
        expect.objectContaining({
          file: 'src/lib/pdfStudio/render/render.ts',
          kind: 'loader-consumer',
          specifier: '../pdfRuntime/pdfjsLoader',
        }),
        expect.objectContaining({
          file: 'src/lib/pdfStudio/assemble/assemble.test.ts',
          kind: 'test-runtime',
          specifier: 'pdfjs-dist',
        }),
      ]),
    )

    expect(summarizePdfRuntimeInventory(inventory)).toMatchObject({
      directRuntime: 1,
      loaderRuntime: 1,
      loaderConsumers: 1,
      testRuntime: 1,
      typeOnly: 1,
    })
  })

  it('ignores runtime imports outside application source files', () => {
    const root = mkdtempSync(join(tmpdir(), 'trama-pdf-runtime-inventory-'))
    write(root, 'scripts/fixture.ts', "import { PDFDocument } from 'pdf-lib'\n")
    write(root, 'src/generated/report.d.ts', "import { PDFDocument } from 'pdf-lib'\n")
    write(root, 'src/lib/pdfStudio/notes.md', "import { PDFDocument } from 'pdf-lib'\n")

    const inventory = collectPdfRuntimeInventory({ root })

    expect(inventory.imports).toEqual([])
    expect(summarizePdfRuntimeInventory(inventory)).toEqual({
      directRuntime: 0,
      loaderRuntime: 0,
      loaderConsumers: 0,
      testRuntime: 0,
      typeOnly: 0,
    })
  })
})
