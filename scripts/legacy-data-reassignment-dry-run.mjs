#!/usr/bin/env node

/**
 * Read-only dry-run for a future legacy-single-user reassignment.
 *
 * This script inventories legacy-owned database rows and unscoped blob keys.
 * It intentionally does not update rows, copy blobs, delete blobs, or mutate
 * Netlify state. The output is meant to support review before any later
 * execution PR.
 */

import { getStore } from '@netlify/blobs'
import pg from 'pg'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PRIVATE_TABLE_CONTRACTS } from './auth-rls-contracts.mjs'
import { LEGACY_USER_ID } from './legacy-identity-contracts.mjs'

export const LEGACY_REASSIGNMENT_MODE = 'dry-run-read-only'
export const LEGACY_BLOB_STORES = [
  'momentos-media',
  'recortes-media',
  'notas-attachments',
]

const DB_URL =
  process.env.DATABASE_URL ||
  process.env.NETLIFY_DB_URL ||
  'postgresql://trama:trama_local_dev@localhost:5433/trama'

const DEFAULT_SAMPLE_LIMIT = 5

const HIGH_REVIEW_TABLES = new Set([
  'api_tokens',
  'notas_attachments',
  'pdf_stamp_assets',
  'secrets',
  'spotify_tokens',
  'whatsapp_accounts',
  'whatsapp_links',
  'whatsapp_messages',
  'whatsapp_outbound_messages',
  'x_tokens',
])

const MEDIUM_REVIEW_TABLES = new Set([
  'momento_access',
  'momento_comments',
  'momento_entities',
  'momento_reactions',
  'momentos',
  'notes_media',
  'pdf_studio_saved_pdfs',
  'recortes',
  'recorte_images',
  'recorte_entities',
  'recorte_highlights',
  'recorte_moments',
  'recorte_notes',
  'recorte_quotes',
])

function numberFromUnknown(value) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function nowIso() {
  return new Date().toISOString()
}

export function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Identificador SQL inseguro para inventario legacy: ${identifier}`)
  }
  return `"${identifier}"`
}

export function tableReviewPolicy(table) {
  if (HIGH_REVIEW_TABLES.has(table)) {
    return {
      autoMigrable: false,
      requiresReview: true,
      rollbackRisk: 'high',
      reviewReason:
        'contiene tokens, adjuntos, mensajes externos o referencias de storage que requieren mapeo humano',
    }
  }

  if (MEDIUM_REVIEW_TABLES.has(table)) {
    return {
      autoMigrable: false,
      requiresReview: true,
      rollbackRisk: 'medium',
      reviewReason:
        'participa en relaciones, sharing, media o superficies derivadas que requieren verificacion cruzada',
    }
  }

  return {
    autoMigrable: true,
    requiresReview: false,
    rollbackRisk: 'low',
    reviewReason:
      'fila owner-scoped sin storage conocido ni contrato compartido especial',
  }
}

export function evaluateTableInventoryRows(
  rows,
  tableContracts = PRIVATE_TABLE_CONTRACTS,
) {
  const rowsByTable = new Map(
    rows.map((row) => [row.table_name ?? row.table, numberFromUnknown(row.legacy_rows)]),
  )
  const tables = tableContracts
    .map((contract) => {
      const legacyRows = rowsByTable.get(contract.table) ?? 0
      const policy = tableReviewPolicy(contract.table)
      return {
        table: contract.table,
        lifecycle: contract.lifecycle,
        reason: contract.reason,
        legacyRows,
        needsAction: legacyRows > 0,
        autoMigrable: policy.autoMigrable,
        requiresReview: policy.requiresReview,
        rollbackRisk: policy.rollbackRisk,
        reviewReason: policy.reviewReason,
      }
    })
    .sort((a, b) => {
      if (b.legacyRows !== a.legacyRows) return b.legacyRows - a.legacyRows
      return a.table.localeCompare(b.table)
    })

  return {
    legacyUserId: LEGACY_USER_ID,
    tablesChecked: tableContracts.length,
    totalLegacyRows: tables.reduce((sum, table) => sum + table.legacyRows, 0),
    tablesWithLegacyRows: tables.filter((table) => table.legacyRows > 0).length,
    writesPerformed: false,
    warnings: [],
    tables,
  }
}

export async function collectDatabaseInventory({
  dbUrl = DB_URL,
  tableContracts = PRIVATE_TABLE_CONTRACTS,
} = {}) {
  const client = new pg.Client({ connectionString: dbUrl })
  await client.connect()
  try {
    return await collectDatabaseInventoryFromClient(client, tableContracts)
  } finally {
    await client.end()
  }
}

export async function collectDatabaseInventoryFromClient(
  client,
  tableContracts = PRIVATE_TABLE_CONTRACTS,
) {
  const rows = []
  const warnings = []

  for (const contract of tableContracts) {
    const tableName = contract.table
    try {
      const { rows: resultRows } = await client.query(
        `SELECT $1::text AS table_name, COUNT(*)::int AS legacy_rows
         FROM ${quoteIdentifier(tableName)}
         WHERE user_id = $2`,
        [tableName, LEGACY_USER_ID],
      )
      rows.push(resultRows[0])
    } catch (err) {
      warnings.push(
        `${tableName}: no se pudo leer inventario legacy (${err?.code ?? 'sin_codigo'}: ${
          err?.message ?? 'sin detalle'
        })`,
      )
    }
  }

  const inventory = evaluateTableInventoryRows(rows, tableContracts)
  return { ...inventory, warnings }
}

export function sanitizeBlobKey(key) {
  if (!key) return '<empty-key>'
  const compact = String(key).replace(/\s+/g, '_')
  if (compact.length <= 12) return `${compact.slice(0, 3)}...${compact.slice(-2)}`
  return `${compact.slice(0, 8)}...${compact.slice(-6)}`
}

export function classifyBlobKey(key) {
  const normalized = String(key ?? '')
  const [firstSegment] = normalized.split('/')
  const scoped = normalized.includes('/') && firstSegment.length > 0

  return {
    key: normalized,
    sanitizedKey: sanitizeBlobKey(normalized),
    scope: scoped ? 'scoped' : 'legacy-unscoped',
    ownerId: scoped ? firstSegment : null,
    legacyUnscoped: !scoped,
  }
}

function blobKey(blob) {
  return blob?.key ?? blob?.name ?? blob?.path ?? null
}

export function summarizeBlobInventory({
  storeName,
  blobs,
  sampleLimit = DEFAULT_SAMPLE_LIMIT,
}) {
  const classified = blobs.map(blobKey).filter(Boolean).map(classifyBlobKey)
  const legacy = classified.filter((blob) => blob.legacyUnscoped)

  return {
    storeName,
    totalKeys: classified.length,
    legacyUnscopedKeys: legacy.length,
    scopedKeys: classified.length - legacy.length,
    autoMigrable: false,
    requiresReview: legacy.length > 0,
    rollbackRisk: legacy.length > 0 ? 'high' : 'low',
    sanitizedExamples: legacy.slice(0, sampleLimit).map((blob) => blob.sanitizedKey),
    reviewReason:
      legacy.length > 0
        ? 'keys sin prefijo de usuario requieren mapear referencia DB y destino antes de copiar o renombrar'
        : 'no hay keys legacy sin prefijo detectadas',
  }
}

export function countManualReviewItems(database, blobs) {
  const tableReviewItems = database.tables.filter(
    (table) => table.legacyRows > 0 && table.requiresReview,
  ).length
  const blobReviewItems = blobs.stores.filter(
    (store) => store.legacyUnscopedKeys > 0 && store.requiresReview,
  ).length

  return tableReviewItems + blobReviewItems
}

export function deriveCutoverReadiness({ database, blobs, targetUserId = null }) {
  const manualReviewItems = countManualReviewItems(database, blobs)
  const highRiskItems =
    database.tables.filter(
      (table) => table.legacyRows > 0 && table.rollbackRisk === 'high',
    ).length +
    blobs.stores.filter(
      (store) => store.legacyUnscopedKeys > 0 && store.rollbackRisk === 'high',
    ).length
  const autoMigrableRows = database.tables
    .filter((table) => table.autoMigrable)
    .reduce((sum, table) => sum + table.legacyRows, 0)
  const warnings = [...database.warnings, ...blobs.warnings]
  const blockers = []
  const nextActions = []

  if (!targetUserId) {
    blockers.push('target_user_id_missing')
    nextActions.push(
      'define LEGACY_REASSIGNMENT_TARGET_USER_ID or pass --target-user-id=<clerk-sub>',
    )
  }
  if (manualReviewItems > 0) {
    blockers.push('manual_review_required')
    nextActions.push(
      'review high/medium risk tables and blob stores before writing a migration executor',
    )
  }
  if (blobs.totalLegacyUnscopedKeys > 0) {
    blockers.push('legacy_unscoped_blobs_present')
    nextActions.push(
      'map every legacy unscoped blob key to an owning row before copy/rename work',
    )
  }
  if (warnings.length > 0) {
    blockers.push('inventory_warnings_present')
    nextActions.push('rerun the dry-run after resolving inventory warnings')
  }

  if (blockers.length === 0) {
    nextActions.push(
      'legacy inventory clean; keep compatibility guardrails until production smoke confirms strict Clerk',
    )
  }

  return {
    status: blockers.length === 0 ? 'ready' : 'blocked',
    targetUserIdPresent: Boolean(targetUserId),
    blockers,
    autoMigrableRows,
    manualReviewItems,
    highRiskItems,
    warnings: warnings.length,
    nextActions,
  }
}

export async function listPaginatedBlobs(store) {
  const blobs = []
  let cursor

  do {
    const page = await store.list(cursor ? { cursor } : undefined)
    blobs.push(...(page?.blobs ?? []))
    cursor = page?.cursor ?? page?.nextCursor ?? null
  } while (cursor)

  return blobs
}

async function listAllStoreBlobs(storeName) {
  return listPaginatedBlobs(getStore(storeName))
}

export async function collectBlobInventory({
  stores = LEGACY_BLOB_STORES,
  sampleLimit = DEFAULT_SAMPLE_LIMIT,
} = {}) {
  const summaries = []
  const warnings = []

  for (const storeName of stores) {
    try {
      const blobs = await listAllStoreBlobs(storeName)
      summaries.push(summarizeBlobInventory({ storeName, blobs, sampleLimit }))
    } catch (err) {
      warnings.push(
        `${storeName}: no se pudo listar Netlify Blobs (${err?.message ?? 'sin detalle'})`,
      )
      summaries.push(summarizeBlobInventory({ storeName, blobs: [], sampleLimit }))
    }
  }

  return {
    storesChecked: stores.length,
    totalKeys: summaries.reduce((sum, store) => sum + store.totalKeys, 0),
    totalLegacyUnscopedKeys: summaries.reduce(
      (sum, store) => sum + store.legacyUnscopedKeys,
      0,
    ),
    warnings,
    stores: summaries,
  }
}

export function summarizeDryRun({
  database,
  blobs,
  targetUserId = process.env.LEGACY_REASSIGNMENT_TARGET_USER_ID ?? null,
  generatedAt = nowIso(),
} = {}) {
  const manualReviewItems = countManualReviewItems(database, blobs)
  const autoMigrableRows = database.tables
    .filter((table) => table.autoMigrable)
    .reduce((sum, table) => sum + table.legacyRows, 0)
  const cutoverReadiness = deriveCutoverReadiness({
    database,
    blobs,
    targetUserId,
  })

  return {
    generatedAt,
    mode: LEGACY_REASSIGNMENT_MODE,
    legacyUserId: LEGACY_USER_ID,
    targetUserId,
    writesPerformed: false,
    database,
    blobs,
    summary: {
      targetUserId,
      totalLegacyRows: database.totalLegacyRows,
      tablesWithLegacyRows: database.tablesWithLegacyRows,
      totalLegacyUnscopedBlobKeys: blobs.totalLegacyUnscopedKeys,
      autoMigrableRows,
      manualReviewItems,
      warnings: [...database.warnings, ...blobs.warnings],
    },
    cutoverReadiness,
    nonGoals: [
      'no update user_id',
      'no copy blob',
      'no delete blob',
      'no rewrite storage_key',
      'no infer target owner automatically',
    ],
  }
}

function yesNo(value) {
  return value ? 'si' : 'no'
}

function legacyCountLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function formatDryRunMarkdown(report) {
  const lines = [
    '# Legacy Data Reassignment Dry Run',
    '',
    `- Generado: ${report.generatedAt}`,
    `- Modo: \`${report.mode}\``,
    `- Legacy user: \`${report.legacyUserId}\``,
    `- Target propuesto: ${report.targetUserId ? `\`${report.targetUserId}\`` : '_no definido_'}`,
    `- Escrituras realizadas: **${report.writesPerformed ? 'si' : 'no'}**`,
    '',
    '## Resumen',
    '',
    `- Filas legacy en DB: ${report.summary.totalLegacyRows}`,
    `- Tablas con filas legacy: ${report.summary.tablesWithLegacyRows}`,
    `- Blob keys legacy sin prefijo: ${report.summary.totalLegacyUnscopedBlobKeys}`,
    `- Filas candidatas a migracion automatica futura: ${report.summary.autoMigrableRows}`,
    `- Items que requieren revision manual: ${report.summary.manualReviewItems}`,
    '',
    '## Matriz de decision',
    '',
    '| Recurso | Legacy encontrado | Automigrable | Requiere revision | Riesgo rollback |',
    '| --- | ---: | --- | --- | --- |',
  ]

  for (const table of report.database.tables.filter((item) => item.legacyRows > 0)) {
    lines.push(
      `| table:${table.table} | ${legacyCountLabel(table.legacyRows, 'row', 'rows')} | ${yesNo(
        table.autoMigrable,
      )} | ${yesNo(table.requiresReview)} | ${table.rollbackRisk} |`,
    )
  }

  for (const store of report.blobs.stores.filter((item) => item.legacyUnscopedKeys > 0)) {
    lines.push(
      `| blob:${store.storeName} | ${legacyCountLabel(
        store.legacyUnscopedKeys,
        'key',
        'keys',
      )} | ${yesNo(store.autoMigrable)} | ${yesNo(store.requiresReview)} | ${
        store.rollbackRisk
      } |`,
    )
  }

  if (
    report.database.tables.every((table) => table.legacyRows === 0) &&
    report.blobs.stores.every((store) => store.legacyUnscopedKeys === 0)
  ) {
    lines.push('| _sin legacy detectado_ | 0 | no aplica | no | low |')
  }

  lines.push('', '## Blob examples sanitizados', '')
  if (report.blobs.stores.length === 0) {
    lines.push('- No se listaron stores en esta ejecucion.')
  }
  for (const store of report.blobs.stores) {
    const examples = store.sanitizedExamples.length
      ? store.sanitizedExamples.map((example) => `\`${example}\``).join(', ')
      : '_sin ejemplos_'
    lines.push(`- ${store.storeName}: ${examples}`)
  }

  lines.push('', '## Warnings', '')
  if (report.summary.warnings.length === 0) {
    lines.push('- Sin warnings.')
  } else {
    for (const warning of report.summary.warnings) lines.push(`- ${warning}`)
  }

  lines.push('', '## Non-goals de este PR', '')
  for (const nonGoal of report.nonGoals) lines.push(`- ${nonGoal}`)

  lines.push('', '## Cutover readiness', '')
  lines.push(`- Estado: **${report.cutoverReadiness.status}**`)
  lines.push(
    `- Target user definido: ${yesNo(report.cutoverReadiness.targetUserIdPresent)}`,
  )
  lines.push(`- Filas automigrables futuras: ${report.cutoverReadiness.autoMigrableRows}`)
  lines.push(`- Items con revision manual: ${report.cutoverReadiness.manualReviewItems}`)
  lines.push(`- Items high-risk: ${report.cutoverReadiness.highRiskItems}`)
  lines.push(
    `- Blockers: ${
      report.cutoverReadiness.blockers.length
        ? report.cutoverReadiness.blockers.map((blocker) => `\`${blocker}\``).join(', ')
        : '_ninguno_'
    }`,
  )
  lines.push('', '### Siguiente accion', '')
  for (const action of report.cutoverReadiness.nextActions) lines.push(`- ${action}`)

  return `${lines.join('\n')}\n`
}

export function formatDryRunJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`
}

export async function writeDryRunArtifacts(report, outDir) {
  await mkdir(outDir, { recursive: true })
  const files = {
    json: join(outDir, 'legacy-data-reassignment-report.json'),
    markdown: join(outDir, 'legacy-data-reassignment-report.md'),
  }
  await writeFile(files.json, formatDryRunJson(report), 'utf8')
  await writeFile(files.markdown, formatDryRunMarkdown(report), 'utf8')
  return files
}

export function parseArgs(argv) {
  const options = {
    json: false,
    markdown: false,
    includeDb: true,
    includeBlobs: true,
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    targetUserId: process.env.LEGACY_REASSIGNMENT_TARGET_USER_ID ?? null,
    outDir: null,
  }

  for (const arg of argv) {
    if (arg === '--json') options.json = true
    else if (arg === '--markdown') options.markdown = true
    else if (arg === '--no-db') options.includeDb = false
    else if (arg === '--no-blobs') options.includeBlobs = false
    else if (arg.startsWith('--sample-limit=')) {
      options.sampleLimit = Math.max(0, numberFromUnknown(arg.split('=')[1]))
    } else if (arg.startsWith('--target-user-id=')) {
      options.targetUserId = arg.slice('--target-user-id='.length) || null
    } else if (arg.startsWith('--out-dir=')) {
      options.outDir = arg.slice('--out-dir='.length) || null
    } else {
      throw new Error(`Argumento no reconocido: ${arg}`)
    }
  }

  if (!options.json && !options.markdown) options.markdown = true
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const database = options.includeDb
    ? await collectDatabaseInventory()
    : evaluateTableInventoryRows([], PRIVATE_TABLE_CONTRACTS)
  const blobs = options.includeBlobs
    ? await collectBlobInventory({ sampleLimit: options.sampleLimit })
    : {
        storesChecked: 0,
        totalKeys: 0,
        totalLegacyUnscopedKeys: 0,
        warnings: [],
        stores: [],
      }
  const report = summarizeDryRun({ database, blobs, targetUserId: options.targetUserId })

  if (options.outDir) {
    const files = await writeDryRunArtifacts(report, options.outDir)
    console.error(`Artifacts dry-run escritos en ${files.markdown} y ${files.json}`)
  }

  if (options.json) process.stdout.write(formatDryRunJson(report))
  if (options.markdown) console.log(formatDryRunMarkdown(report))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main()
  } catch (err) {
    console.error(err?.message ?? err)
    process.exitCode = 1
  }
}
