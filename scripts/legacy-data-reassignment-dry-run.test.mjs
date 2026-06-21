import { describe, expect, it } from 'vitest'
import {
  LEGACY_BLOB_STORES,
  LEGACY_REASSIGNMENT_MODE,
  classifyBlobKey,
  evaluateTableInventoryRows,
  formatDryRunMarkdown,
  quoteIdentifier,
  sanitizeBlobKey,
  summarizeBlobInventory,
  summarizeDryRun,
  tableReviewPolicy,
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
})
