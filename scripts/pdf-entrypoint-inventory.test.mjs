import { describe, expect, it } from 'vitest'

import {
  PDF_ENTRYPOINT_GROUPS,
  PDF_ENTRYPOINT_INVENTORY,
  PDF_LAZY_ENTRYPOINT_BASES,
  PDF_PAYLOAD_BASES,
} from './pdf-entrypoint-inventory.mjs'
import { PDF_AGGREGATE_BUDGETS, PDF_BUNDLE_FAMILIES } from './pdf-bundle-families.mjs'

describe('PDF entrypoint inventory', () => {
  it('documents the executable PDF entrypoint groups', () => {
    expect(PDF_ENTRYPOINT_GROUPS).toEqual([
      'viewer',
      'editor',
      'assembleExport',
      'forms',
      'heavyWorker',
      'ocr',
      'stamps',
      'libro',
    ])
    expect(PDF_ENTRYPOINT_INVENTORY.map((entry) => entry.id)).toEqual(
      PDF_ENTRYPOINT_GROUPS,
    )
  })

  it('keeps every executable entrypoint actionable', () => {
    for (const entry of PDF_ENTRYPOINT_INVENTORY) {
      expect(entry.label).toMatch(/^PDF /)
      expect(entry.intent.length).toBeGreaterThan(20)
      expect(entry.bases.length).toBeGreaterThan(0)
      expect(entry.lazyBases.length).toBeGreaterThanOrEqual(entry.bases.length)
      for (const base of entry.bases) {
        expect(entry.lazyBases).toContain(base)
      }
    }
  })

  it('derives bundle families and lazy boundaries from the same source', () => {
    const total = PDF_AGGREGATE_BUDGETS.find(
      (family) => family.name === 'PDF lazy payload total',
    )

    expect(total?.bases).toEqual(PDF_PAYLOAD_BASES)
    expect(PDF_BUNDLE_FAMILIES.map((family) => family.name)).toEqual(
      PDF_ENTRYPOINT_INVENTORY.map((entry) => entry.label),
    )
    expect(PDF_LAZY_ENTRYPOINT_BASES).toEqual(
      [...new Set(PDF_ENTRYPOINT_INVENTORY.flatMap((entry) => entry.lazyBases))].sort(),
    )
  })
})
