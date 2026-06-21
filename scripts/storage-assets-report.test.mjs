import { describe, expect, test } from 'vitest'

import {
  DOMAINS,
  evaluateStorageAssetCoverageRows,
  formatStorageAssetCoverageReport,
} from './storage-assets-report.mjs'

describe('storage assets report', () => {
  test('normaliza cobertura por dominio incluyendo dominios vacios', () => {
    const report = evaluateStorageAssetCoverageRows([
      {
        domain: 'notas-attachments',
        total_assets: '3',
        active_assets: '2',
        soft_deleted_assets: '1',
        missing_checksum_assets: '1',
      },
      {
        domain: 'pdf-stamp-assets',
        total_assets: 2,
        active_assets: 2,
        soft_deleted_assets: 0,
        missing_checksum_assets: 0,
      },
    ])

    expect(report.writesPerformed).toBe(false)
    expect(report.domains).toHaveLength(DOMAINS.length)
    expect(report.totals).toMatchObject({
      totalAssets: 5,
      activeAssets: 4,
      softDeletedAssets: 1,
      missingChecksumAssets: 1,
      emptyDomains: 3,
    })
    expect(report.domains.find((domain) => domain.domain === 'recortes-media')).toEqual(
      expect.objectContaining({
        totalAssets: 0,
        empty: true,
      }),
    )
  })

  test('formatea un reporte markdown read-only para PRs y migraciones futuras', () => {
    const report = evaluateStorageAssetCoverageRows([
      {
        domain: 'momentos-media',
        total_assets: 4,
        active_assets: 3,
        soft_deleted_assets: 1,
        missing_checksum_assets: 0,
      },
    ])

    const markdown = formatStorageAssetCoverageReport(report)

    expect(markdown).toContain('storage_assets_report: ok')
    expect(markdown).toContain('writes_performed: false')
    expect(markdown).toContain('| momentos-media | 4 | 3 | 1 | 0 |')
    expect(markdown).toContain('| pdf-stamp-assets | 0 | 0 | 0 | 0 |')
  })
})
