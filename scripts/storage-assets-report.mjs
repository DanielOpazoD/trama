#!/usr/bin/env node
import pg from 'pg'
import { pathToFileURL } from 'node:url'

export const DOMAINS = [
  'notas-attachments',
  'momentos-media',
  'recortes-media',
  'pdf-studio-saved-pdfs',
  'pdf-stamp-assets',
]

const DB_URL =
  process.env.DATABASE_URL ||
  process.env.NETLIFY_DB_URL ||
  'postgresql://trama:trama_local_dev@localhost:5433/trama'

function asNumber(value) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function evaluateStorageAssetCoverageRows(rows) {
  const byDomain = new Map(rows.map((row) => [row.domain, row]))
  const domains = DOMAINS.map((domain) => {
    const row = byDomain.get(domain) ?? {}
    const totalAssets = asNumber(row.total_assets)
    const activeAssets = asNumber(row.active_assets)
    const softDeletedAssets = asNumber(row.soft_deleted_assets)
    const missingChecksumAssets = asNumber(row.missing_checksum_assets)
    return {
      domain,
      totalAssets,
      activeAssets,
      softDeletedAssets,
      missingChecksumAssets,
      empty: totalAssets === 0,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    writesPerformed: false,
    totals: {
      totalAssets: domains.reduce((sum, domain) => sum + domain.totalAssets, 0),
      activeAssets: domains.reduce((sum, domain) => sum + domain.activeAssets, 0),
      softDeletedAssets: domains.reduce(
        (sum, domain) => sum + domain.softDeletedAssets,
        0,
      ),
      missingChecksumAssets: domains.reduce(
        (sum, domain) => sum + domain.missingChecksumAssets,
        0,
      ),
      emptyDomains: domains.filter((domain) => domain.empty).length,
    },
    domains,
  }
}

export function formatStorageAssetCoverageReport(report) {
  const lines = [
    'storage_assets_report: ok',
    `generated_at: ${report.generatedAt}`,
    `writes_performed: ${report.writesPerformed}`,
    '',
    '| domain | total | active | soft_deleted | missing_checksum |',
    '| --- | ---: | ---: | ---: | ---: |',
  ]
  for (const domain of report.domains) {
    lines.push(
      `| ${domain.domain} | ${domain.totalAssets} | ${domain.activeAssets} | ${domain.softDeletedAssets} | ${domain.missingChecksumAssets} |`,
    )
  }
  lines.push(
    '',
    `totals: ${report.totals.totalAssets} assets, ${report.totals.emptyDomains} empty domains, ${report.totals.missingChecksumAssets} missing checksums`,
  )
  return `${lines.join('\n')}\n`
}

export async function collectStorageAssetCoverage({ dbUrl = DB_URL } = {}) {
  const client = new pg.Client({ connectionString: dbUrl })
  await client.connect()
  try {
    const { rows } = await client.query(
      `SELECT
         domain,
         COUNT(*)::int AS total_assets,
         COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS active_assets,
         COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS soft_deleted_assets,
         COUNT(*) FILTER (WHERE checksum IS NULL)::int AS missing_checksum_assets
       FROM storage_assets
       GROUP BY domain
       ORDER BY domain`,
    )
    return evaluateStorageAssetCoverageRows(rows)
  } finally {
    await client.end()
  }
}

async function main() {
  try {
    const report = await collectStorageAssetCoverage()
    process.stdout.write(formatStorageAssetCoverageReport(report))
  } catch (err) {
    const code = err?.code ? ` (${err.code})` : ''
    const message =
      err?.message && String(err.message).trim().length > 0
        ? String(err.message).trim()
        : 'sin detalle del driver pg'
    console.error(`No pude generar storage-assets:report${code}: ${message}`)
    console.error(
      'Para correrlo localmente, levanta la DB con `npm run db:up` o define DATABASE_URL / NETLIFY_DB_URL.',
    )
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
