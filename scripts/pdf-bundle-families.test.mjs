import { describe, expect, it } from 'vitest'

import { PDF_AGGREGATE_BUDGETS, PDF_BUNDLE_FAMILIES } from './pdf-bundle-families.mjs'

describe('PDF bundle families', () => {
  it('keeps one total family and actionable subfamilies', () => {
    expect(PDF_AGGREGATE_BUDGETS.map((family) => family.name)).toEqual([
      'PDF lazy payload total',
      'PDF viewer',
      'PDF editor',
      'PDF assemble/export',
      'PDF forms',
      'PDF OCR',
      'PDF stamps',
      'PDF libro',
    ])
  })

  it('classifies every PDF base in at least one actionable subfamily', () => {
    const classified = new Set(PDF_BUNDLE_FAMILIES.flatMap((family) => family.bases))
    const total = PDF_AGGREGATE_BUDGETS.find(
      (family) => family.name === 'PDF lazy payload total',
    )

    expect(total?.bases.filter((base) => !classified.has(base))).toEqual([])
  })
})
