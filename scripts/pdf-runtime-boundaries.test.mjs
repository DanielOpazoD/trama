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
})
