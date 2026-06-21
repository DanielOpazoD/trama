import { describe, expect, it } from 'vitest'
import { summarizeLighthouseReport } from './lighthouse-report-summary.mjs'

describe('summarizeLighthouseReport', () => {
  it('extrae métricas principales y oportunidades de una auditoría JSON', () => {
    const summary = summarizeLighthouseReport({
      requestedUrl: 'https://tramahub.app/',
      finalDisplayedUrl: 'https://tramahub.app/',
      lighthouseVersion: '13.2.0',
      categories: {
        performance: { score: 0.73 },
        accessibility: { score: 1 },
      },
      audits: {
        'first-contentful-paint': { numericValue: 2890 },
        'largest-contentful-paint': { numericValue: 5010 },
        'total-blocking-time': { numericValue: 90 },
        'cumulative-layout-shift': { numericValue: 0 },
        'network-requests': {
          details: {
            items: [{ url: 'https://tramahub.app/trama-icon.png', transferSize: 694000 }],
          },
        },
        diagnostics: {
          details: { items: [{ numRequests: 4, totalByteWeight: 801000 }] },
        },
      },
    })

    expect(summary).toMatchObject({
      url: 'https://tramahub.app/',
      scores: { performance: 73, accessibility: 100 },
      metrics: {
        fcpMs: 2890,
        lcpMs: 5010,
        tbtMs: 90,
        cls: 0,
      },
    })
    expect(summary.largeAssets[0]).toMatchObject({
      url: 'https://tramahub.app/trama-icon.png',
      transferKb: 678,
    })
  })
})
