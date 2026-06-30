import { describe, expect, it } from 'vitest'

import {
  chunkBaseName,
  classifyBundleEntry,
  evaluateDuplicateBudgets,
  summarizeBundleEntries,
} from './bundle-budget.mjs'

describe('bundle budget helpers', () => {
  it('normaliza nombres de chunks con hashes vite que contienen guiones', () => {
    expect(chunkBaseName('MomentosView-D9Z41wa-.js')).toBe('MomentosView')
    expect(chunkBaseName('vendor-react-UUNBh1e2.js')).toBe('vendor-react')
    expect(chunkBaseName('QuotesView-t-HhUjo4.js')).toBe('QuotesView')
    expect(chunkBaseName('useNotes--DH_LZ2u.js')).toBe('useNotes')
    expect(chunkBaseName('pdf.worker.min-CrMmvqMo.mjs')).toBe('pdf.worker.min')
  })

  it('usa budgets conocidos para hashes vite ambiguos con guion interno', () => {
    expect(chunkBaseName('GraphView-B-e06fBp.js', ['GraphView'])).toBe('GraphView')
    expect(chunkBaseName('vendor-pdf-lib-C3zzWZyr.js', ['vendor-pdf-lib'])).toBe(
      'vendor-pdf-lib',
    )
  })

  it('permite chunks chicos sin budget explicito', () => {
    expect(
      classifyBundleEntry({
        base: 'TinyWidget',
        budget: undefined,
        gzKb: 3,
        maxUnbudgetedKb: 10,
      }),
    ).toEqual({ file: 'TinyWidget', gzKb: 3, status: 'no-budget' })
  })

  it('falla chunks grandes sin budget explicito', () => {
    expect(
      classifyBundleEntry({
        base: 'BigRoute',
        budget: undefined,
        gzKb: 13,
        maxUnbudgetedKb: 10,
      }),
    ).toEqual({
      file: 'BigRoute',
      gzKb: 13,
      budget: 10,
      status: 'missing-budget',
    })
  })

  it('falla chunks que exceden su budget explicito', () => {
    expect(
      classifyBundleEntry({
        base: 'GraphView',
        budget: 18,
        gzKb: 19,
        maxUnbudgetedKb: 10,
      }),
    ).toEqual({ file: 'GraphView', gzKb: 19, budget: 18, status: 'over-budget' })
  })

  it('resume familias y duplicaciones para el reporte accionable', () => {
    const entries = [
      { file: 'PdfStudioView', gzKb: 64, status: 'ok' },
      { file: 'pdf.worker.min', gzKb: 361, status: 'ok' },
      { file: 'vendor-pdf-lib', gzKb: 542, status: 'ok' },
      { file: 'vendor-pdf-lib', gzKb: 203, status: 'ok' },
      { file: 'GraphView', gzKb: 13, status: 'ok' },
    ]

    expect(
      summarizeBundleEntries(entries, [
        {
          name: 'PDF lazy payload total',
          budget: 1300,
          bases: ['PdfStudioView', 'pdf.worker.min', 'vendor-pdf-lib'],
        },
      ]),
    ).toEqual({
      duplicates: [{ file: 'vendor-pdf-lib', count: 2, gzKb: 745 }],
      families: [
        {
          name: 'PDF lazy payload total',
          gzKb: 1170,
          budget: 1300,
          status: 'ok',
          offenders: [
            { file: 'vendor-pdf-lib', gzKb: 745 },
            { file: 'pdf.worker.min', gzKb: 361 },
            { file: 'PdfStudioView', gzKb: 64 },
          ],
        },
      ],
    })
  })

  it('falla ratchets de duplicados cuando vendors pesados crecen o se multiplican', () => {
    expect(
      evaluateDuplicateBudgets(
        [
          { file: 'vendor-pdf-lib', count: 2, gzKb: 745 },
          { file: 'vendor-pdfjs', count: 2, gzKb: 248 },
        ],
        {
          'vendor-pdf-lib': { maxCount: 2, maxGzKb: 750 },
          'vendor-pdfjs': { maxCount: 1, maxGzKb: 130 },
        },
      ),
    ).toEqual([
      {
        file: 'vendor-pdfjs',
        count: 2,
        gzKb: 248,
        maxCount: 1,
        maxGzKb: 130,
        status: 'duplicate-over-budget',
      },
    ])
  })
})
