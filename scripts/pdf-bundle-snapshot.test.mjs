import { describe, expect, it } from 'vitest'

import { summarizeBundleEntries } from './bundle-budget.mjs'
import { PDF_AGGREGATE_BUDGETS } from './pdf-bundle-families.mjs'
import { PDF_BUNDLE_SNAPSHOT } from './fixtures/pdf-bundle-snapshot.mjs'

describe('PDF bundle snapshot', () => {
  it('captures the current PDF worker and vendor duplication shape', () => {
    const summary = summarizeBundleEntries(
      PDF_BUNDLE_SNAPSHOT.entries,
      PDF_AGGREGATE_BUDGETS,
    )
    const duplicates = Object.fromEntries(
      summary.duplicates.map((entry) => [
        entry.file,
        { count: entry.count, gzKb: entry.gzKb },
      ]),
    )

    expect(duplicates['vendor-pdf-lib']).toEqual(
      PDF_BUNDLE_SNAPSHOT.duplicates['vendor-pdf-lib'],
    )
    expect(duplicates['vendor-pdfjs']).toEqual(
      PDF_BUNDLE_SNAPSHOT.duplicates['vendor-pdfjs'],
    )
    expect(duplicates['vendor-ocr']).toEqual(PDF_BUNDLE_SNAPSHOT.duplicates['vendor-ocr'])

    for (const worker of PDF_BUNDLE_SNAPSHOT.workers) {
      expect(PDF_BUNDLE_SNAPSHOT.entries.some((entry) => entry.file === worker)).toBe(
        true,
      )
    }
  })

  it('keeps the PDF family budgets in the snapshot green', () => {
    const summary = summarizeBundleEntries(
      PDF_BUNDLE_SNAPSHOT.entries,
      PDF_AGGREGATE_BUDGETS,
    )
    const families = Object.fromEntries(
      summary.families.map((family) => [
        family.name,
        { gzKb: family.gzKb, budget: family.budget, status: family.status },
      ]),
    )

    for (const [name, expected] of Object.entries(PDF_BUNDLE_SNAPSHOT.families)) {
      expect(families[name]).toEqual({ ...expected, status: 'ok' })
    }
  })
})
