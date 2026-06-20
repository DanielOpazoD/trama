import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  findPdfRuntimeBoundaryIssues,
  formatPdfRuntimeBoundaryIssues,
} from './pdf-runtime-boundaries.mjs'

describe('PDF runtime boundaries', () => {
  it('keeps runtime imports behind the shared loaders', () => {
    expect(findPdfRuntimeBoundaryIssues()).toEqual([])
  })

  it('formats boundary issues for CI output', () => {
    expect(
      formatPdfRuntimeBoundaryIssues([
        {
          check: 'pdf-lib-static-loader',
          file: 'src/lib/pdfStudio/example.ts',
          line: 7,
          reason: 'usar loader',
          text: "import { PDFDocument } from 'pdf-lib'",
        },
      ]),
    ).toContain('src/lib/pdfStudio/example.ts:7 [pdf-lib-static-loader]')
  })

  it('allows inline type-only pdf-lib imports', () => {
    const root = mkdtempSync(join(tmpdir(), 'trama-pdf-boundary-'))
    const srcDir = join(root, 'src/lib/pdfStudio/example')
    mkdirSync(srcDir, { recursive: true })
    writeFileSync(
      join(srcDir, 'types.ts'),
      "import { type PDFDocument, type PDFPage } from 'pdf-lib'\n",
    )

    expect(findPdfRuntimeBoundaryIssues({ root })).toEqual([])
  })

  it('still rejects mixed runtime and inline type imports from pdf-lib', () => {
    const root = mkdtempSync(join(tmpdir(), 'trama-pdf-boundary-'))
    const srcDir = join(root, 'src/lib/pdfStudio/example')
    mkdirSync(srcDir, { recursive: true })
    writeFileSync(
      join(srcDir, 'mixed.ts'),
      "import { type PDFDocument, PDFName } from 'pdf-lib'\n",
    )

    expect(findPdfRuntimeBoundaryIssues({ root })).toMatchObject([
      {
        check: 'pdf-lib-static-loader',
        file: 'src/lib/pdfStudio/example/mixed.ts',
        line: 1,
      },
    ])
  })
})
