import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  LEGACY_BLOB_STORES,
  LEGACY_REASSIGNMENT_MODE,
  classifyBlobKey,
  collectDatabaseInventoryFromClient,
  evaluateTableInventoryRows,
  formatDryRunJson,
  formatDryRunMarkdown,
  listPaginatedBlobs,
  parseArgs,
  quoteIdentifier,
  sanitizeBlobKey,
  summarizeBlobInventory,
  summarizeDryRun,
  tableReviewPolicy,
  writeDryRunArtifacts,
} from './legacy-data-reassignment-dry-run.mjs'
import { LEGACY_USER_ID } from './legacy-identity-contracts.mjs'

describe('legacy data reassignment dry-run', () => {
  it('normaliza un inventario SQL vacio sin proponer escrituras', () => {
    const inventory = evaluateTableInventoryRows(
      [],
      [
        { table: 'notes', lifecycle: 'soft-delete', reason: 'private notes' },
        { table: 'recortes', lifecycle: 'soft-delete', reason: 'private clips' },
      ],
    )

    expect(inventory).toMatchObject({
      legacyUserId: LEGACY_USER_ID,
      totalLegacyRows: 0,
      writesPerformed: false,
      tablesChecked: 2,
    })
    expect(inventory.tables).toEqual([
      expect.objectContaining({
        table: 'notes',
        legacyRows: 0,
        autoMigrable: true,
        requiresReview: false,
        rollbackRisk: 'low',
      }),
      expect.objectContaining({
        table: 'recortes',
        legacyRows: 0,
        autoMigrable: false,
        requiresReview: true,
        rollbackRisk: 'medium',
      }),
    ])
  })

  it('marca tablas con legacy rows y conserva razon operacional', () => {
    const inventory = evaluateTableInventoryRows(
      [
        { table_name: 'notes', legacy_rows: '4' },
        { table_name: 'notas_attachments', legacy_rows: 2 },
      ],
      [
        { table: 'notes', lifecycle: 'soft-delete', reason: 'private notes' },
        {
          table: 'notas_attachments',
          lifecycle: 'soft-delete',
          reason: 'attachment metadata',
        },
      ],
    )

    expect(inventory.totalLegacyRows).toBe(6)
    expect(inventory.tables).toContainEqual(
      expect.objectContaining({
        table: 'notes',
        legacyRows: 4,
        needsAction: true,
        autoMigrable: true,
        reason: 'private notes',
      }),
    )
    expect(inventory.tables).toContainEqual(
      expect.objectContaining({
        table: 'notas_attachments',
        legacyRows: 2,
        needsAction: true,
        autoMigrable: false,
        requiresReview: true,
        rollbackRisk: 'high',
      }),
    )
  })

  it('clasifica blob keys prefijadas y legacy sin exponer la key completa', () => {
    expect(classifyBlobKey('user_123/media/firma-legal.png')).toMatchObject({
      scope: 'scoped',
      ownerId: 'user_123',
      legacyUnscoped: false,
    })
    expect(classifyBlobKey('firma-legacy-super-secreta.png')).toMatchObject({
      scope: 'legacy-unscoped',
      ownerId: null,
      legacyUnscoped: true,
    })

    const sanitized = sanitizeBlobKey('firma-legacy-super-secreta.png')
    expect(sanitized).not.toBe('firma-legacy-super-secreta.png')
    expect(sanitized).toContain('...')
  })

  it('resume blobs por store con ejemplos sanitizados y riesgo de rollback', () => {
    const summary = summarizeBlobInventory({
      storeName: 'notas-attachments',
      blobs: [
        { key: 'legacy-audio.wav' },
        { key: 'user_abc/note/photo.png' },
        { key: 'legacy-image.png' },
      ],
      sampleLimit: 1,
    })

    expect(summary).toMatchObject({
      storeName: 'notas-attachments',
      totalKeys: 3,
      legacyUnscopedKeys: 2,
      scopedKeys: 1,
      autoMigrable: false,
      requiresReview: true,
      rollbackRisk: 'high',
    })
    expect(summary.sanitizedExamples).toHaveLength(1)
    expect(summary.sanitizedExamples[0]).not.toBe('legacy-audio.wav')
  })

  it('produce un reporte agregado con modo dry-run y matriz markdown', () => {
    const database = evaluateTableInventoryRows(
      [{ table_name: 'notes', legacy_rows: 1 }],
      [{ table: 'notes', lifecycle: 'soft-delete', reason: 'private notes' }],
    )
    const blobs = {
      storesChecked: LEGACY_BLOB_STORES.length,
      totalLegacyUnscopedKeys: 1,
      totalKeys: 2,
      stores: [
        summarizeBlobInventory({
          storeName: 'momentos-media',
          blobs: [{ key: 'legacy-video.mp4' }, { key: 'user_abc/video.mp4' }],
        }),
      ],
      warnings: [],
    }
    const report = summarizeDryRun({ database, blobs, targetUserId: 'user_owner' })

    expect(report.mode).toBe(LEGACY_REASSIGNMENT_MODE)
    expect(report.writesPerformed).toBe(false)
    expect(report.summary).toMatchObject({
      totalLegacyRows: 1,
      totalLegacyUnscopedBlobKeys: 1,
      targetUserId: 'user_owner',
      manualReviewItems: 1,
    })

    const markdown = formatDryRunMarkdown(report)
    expect(markdown).toContain(
      '| Recurso | Legacy encontrado | Automigrable | Requiere revision | Riesgo rollback |',
    )
    expect(markdown).toContain('| table:notes | 1 row | si | no | low |')
    expect(markdown).toContain('| blob:momentos-media | 1 key | no | si | high |')
  })

  it('clasifica readiness de cutover con target faltante y revision manual', () => {
    const database = evaluateTableInventoryRows(
      [
        { table_name: 'notes', legacy_rows: 2 },
        { table_name: 'notas_attachments', legacy_rows: 1 },
      ],
      [
        { table: 'notes', lifecycle: 'soft-delete', reason: 'private notes' },
        {
          table: 'notas_attachments',
          lifecycle: 'soft-delete',
          reason: 'attachment metadata',
        },
      ],
    )
    const blobs = {
      storesChecked: 1,
      totalKeys: 2,
      totalLegacyUnscopedKeys: 1,
      stores: [
        summarizeBlobInventory({
          storeName: 'notas-attachments',
          blobs: [{ key: 'legacy-photo.png' }, { key: 'user_real/photo.png' }],
        }),
      ],
      warnings: [],
    }

    const report = summarizeDryRun({ database, blobs, targetUserId: null })

    expect(report.cutoverReadiness).toMatchObject({
      status: 'blocked',
      targetUserIdPresent: false,
      autoMigrableRows: 2,
      manualReviewItems: 2,
      highRiskItems: 2,
    })
    expect(report.cutoverReadiness.blockers).toEqual(
      expect.arrayContaining([
        'target_user_id_missing',
        'manual_review_required',
        'legacy_unscoped_blobs_present',
      ]),
    )
    expect(report.cutoverReadiness.nextActions).toEqual(
      expect.arrayContaining([
        'define LEGACY_REASSIGNMENT_TARGET_USER_ID or pass --target-user-id=<clerk-sub>',
        'review high/medium risk tables and blob stores before writing a migration executor',
      ]),
    )
  })

  it('declara readiness lista solo cuando no queda legacy y existe target', () => {
    const database = evaluateTableInventoryRows(
      [],
      [{ table: 'notes', lifecycle: 'soft-delete', reason: 'private notes' }],
    )
    const blobs = {
      storesChecked: 1,
      totalKeys: 3,
      totalLegacyUnscopedKeys: 0,
      stores: [
        summarizeBlobInventory({
          storeName: 'momentos-media',
          blobs: [{ key: 'user_real/photo.png' }, { key: 'user_real/audio.webm' }],
        }),
      ],
      warnings: [],
    }

    const report = summarizeDryRun({
      database,
      blobs,
      targetUserId: 'user_real',
    })

    expect(report.cutoverReadiness).toMatchObject({
      status: 'ready',
      blockers: [],
      targetUserIdPresent: true,
      autoMigrableRows: 0,
      manualReviewItems: 0,
      highRiskItems: 0,
    })
    expect(report.cutoverReadiness.nextActions).toContain(
      'legacy inventory clean; keep compatibility guardrails until production smoke confirms strict Clerk',
    )
  })

  it('no filtra blob keys crudas en el Markdown del reporte', () => {
    const rawKey = 'contrato-firma-privada-con-nombre-real.png'
    const database = evaluateTableInventoryRows(
      [],
      [{ table: 'notes', lifecycle: 'soft-delete', reason: 'private notes' }],
    )
    const blobs = {
      storesChecked: 1,
      totalLegacyUnscopedKeys: 1,
      totalKeys: 1,
      stores: [
        summarizeBlobInventory({
          storeName: 'recortes-media',
          blobs: [{ key: rawKey }],
          sampleLimit: 1,
        }),
      ],
      warnings: [],
    }

    const markdown = formatDryRunMarkdown(
      summarizeDryRun({ database, blobs, generatedAt: '2026-06-21T00:00:00.000Z' }),
    )

    expect(markdown).not.toContain(rawKey)
    expect(markdown).toContain('contrat')
    expect(markdown).toContain('...al.png')
  })

  it('rechaza identificadores SQL inseguros para mantener el inventario read-only', () => {
    expect(quoteIdentifier('notes')).toBe('"notes"')
    expect(quoteIdentifier('momento_entities')).toBe('"momento_entities"')
    expect(() => quoteIdentifier('notes; drop table notes')).toThrow(
      /Identificador SQL inseguro/,
    )
  })

  it('documenta tablas sensibles como review manual por defecto', () => {
    expect(tableReviewPolicy('notes')).toMatchObject({
      autoMigrable: true,
      requiresReview: false,
      rollbackRisk: 'low',
    })
    expect(tableReviewPolicy('api_tokens')).toMatchObject({
      autoMigrable: false,
      requiresReview: true,
      rollbackRisk: 'high',
    })
    expect(tableReviewPolicy('spotify_tokens')).toMatchObject({
      autoMigrable: false,
      requiresReview: true,
      rollbackRisk: 'high',
    })
    expect(tableReviewPolicy('recorte_images')).toMatchObject({
      autoMigrable: false,
      requiresReview: true,
      rollbackRisk: 'medium',
    })
    expect(tableReviewPolicy('momento_access')).toMatchObject({
      autoMigrable: false,
      requiresReview: true,
    })
  })

  it('acumula warnings cuando una tabla falla sin abortar el inventario SQL', async () => {
    const fakeClient = {
      async query(sql, params) {
        const [tableName] = params
        if (tableName === 'recortes') {
          const err = new Error('relation does not exist')
          err.code = '42P01'
          throw err
        }
        return { rows: [{ table_name: tableName, legacy_rows: 3 }] }
      },
    }

    const inventory = await collectDatabaseInventoryFromClient(fakeClient, [
      { table: 'notes', lifecycle: 'soft-delete', reason: 'private notes' },
      { table: 'recortes', lifecycle: 'soft-delete', reason: 'private clips' },
    ])

    expect(inventory.totalLegacyRows).toBe(3)
    expect(inventory.tables).toContainEqual(
      expect.objectContaining({ table: 'notes', legacyRows: 3 }),
    )
    expect(inventory.tables).toContainEqual(
      expect.objectContaining({ table: 'recortes', legacyRows: 0 }),
    )
    expect(inventory.warnings).toEqual([
      expect.stringContaining('recortes: no se pudo leer inventario legacy (42P01'),
    ])
  })

  it('lista blobs paginados hasta agotar cursor', async () => {
    const calls = []
    const fakeStore = {
      async list(options) {
        calls.push(options ?? null)
        if (!options?.cursor) {
          return { blobs: [{ key: 'legacy-a.png' }], cursor: 'page-2' }
        }
        return { blobs: [{ key: 'user_123/scoped.png' }] }
      },
    }

    const blobs = await listPaginatedBlobs(fakeStore)

    expect(calls).toEqual([null, { cursor: 'page-2' }])
    expect(blobs).toEqual([{ key: 'legacy-a.png' }, { key: 'user_123/scoped.png' }])
  })

  it('mantiene decisiones de migracion iguales aunque se declare target owner', () => {
    const database = evaluateTableInventoryRows(
      [{ table_name: 'notas_attachments', legacy_rows: 2 }],
      [
        {
          table: 'notas_attachments',
          lifecycle: 'soft-delete',
          reason: 'attachment metadata',
        },
      ],
    )
    const blobs = {
      storesChecked: 1,
      totalKeys: 1,
      totalLegacyUnscopedKeys: 1,
      stores: [
        summarizeBlobInventory({
          storeName: 'notas-attachments',
          blobs: [{ key: 'legacy-photo.png' }],
        }),
      ],
      warnings: [],
    }

    const withoutTarget = summarizeDryRun({ database, blobs, targetUserId: null })
    const withTarget = summarizeDryRun({ database, blobs, targetUserId: 'user_real' })

    expect(withTarget.summary.targetUserId).toBe('user_real')
    expect(withTarget.summary.manualReviewItems).toBe(
      withoutTarget.summary.manualReviewItems,
    )
    expect(withTarget.database.tables).toEqual(withoutTarget.database.tables)
    expect(withTarget.blobs.stores).toEqual(withoutTarget.blobs.stores)
  })

  it('escribe artifacts Markdown y JSON cuando se entrega outDir', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'legacy-reassignment-'))
    try {
      const database = evaluateTableInventoryRows(
        [{ table_name: 'notes', legacy_rows: 1 }],
        [{ table: 'notes', lifecycle: 'soft-delete', reason: 'private notes' }],
      )
      const blobs = {
        storesChecked: 0,
        totalKeys: 0,
        totalLegacyUnscopedKeys: 0,
        stores: [],
        warnings: [],
      }
      const report = summarizeDryRun({
        database,
        blobs,
        generatedAt: '2026-06-21T00:00:00.000Z',
      })

      const files = await writeDryRunArtifacts(report, outDir)

      expect(files).toEqual({
        json: join(outDir, 'legacy-data-reassignment-report.json'),
        markdown: join(outDir, 'legacy-data-reassignment-report.md'),
      })
      await expect(readFile(files.markdown, 'utf8')).resolves.toContain(
        '# Legacy Data Reassignment Dry Run',
      )
      await expect(readFile(files.json, 'utf8')).resolves.toBe(formatDryRunJson(report))
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })

  it('parsea out-dir sin activar escrituras sobre datos', () => {
    expect(parseArgs(['--json', '--out-dir=/tmp/legacy-report'])).toMatchObject({
      json: true,
      markdown: false,
      outDir: '/tmp/legacy-report',
      includeDb: true,
      includeBlobs: true,
    })
  })

  it('mantiene el script sin caminos de escritura de datos o blobs', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts/legacy-data-reassignment-dry-run.mjs'),
      'utf8',
    )
    const forbiddenDataWrites = [
      /\bstore\.(set|delete|upload|copy)\s*\(/,
      /\bclient\.query\(\s*`[^`]*\b(UPDATE|DELETE|INSERT|ALTER|DROP)\b/i,
      /\bgetStore\([^)]*\)\.(set|delete|upload|copy)\s*\(/,
    ]

    for (const forbidden of forbiddenDataWrites) {
      expect(source).not.toMatch(forbidden)
    }
  })
})
