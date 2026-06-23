import { describe, expect, it } from 'vitest'
import {
  buildUserIdWriteContractReport,
  findUserIdWriteContractIssues,
  findUserIdWriteContractWarnings,
  hasBlockingUserIdWriteFindings,
} from './user-id-write-contracts.mjs'

describe('user_id write contracts', () => {
  it('detecta inserts a tablas privadas que no escriben user_id explicitamente', () => {
    const issues = findUserIdWriteContractIssues({
      privateTables: ['notes'],
      sources: [
        {
          file: 'netlify/functions/notes.mts',
          source: `
            await sql\`
              INSERT INTO notes (content, title)
              VALUES (\${content}, \${title})
            \`
          `,
        },
      ],
    })

    expect(issues).toEqual([
      {
        file: 'netlify/functions/notes.mts',
        table: 'notes',
        columns: ['content', 'title'],
        message:
          'netlify/functions/notes.mts inserta en notes sin columna user_id explicita.',
      },
    ])
  })

  it('acepta inserts que escriben user_id explicitamente', () => {
    const issues = findUserIdWriteContractIssues({
      privateTables: ['notes'],
      sources: [
        {
          file: 'netlify/functions/notes.mts',
          source: `
            await sql\`
              INSERT INTO notes (content, title, user_id)
              VALUES (\${content}, \${title}, \${userId})
            \`
          `,
        },
      ],
    })

    expect(issues).toEqual([])
  })

  it('ignora tablas catalogales o publicas que no forman parte del contrato privado', () => {
    const issues = findUserIdWriteContractIssues({
      privateTables: ['notes'],
      sources: [
        {
          file: 'netlify/functions/entity-types.mts',
          source: `
            await sql\`
              INSERT INTO entity_types (slug, label, sort_order)
              VALUES ('persona', 'Persona', 1)
            \`
          `,
        },
      ],
    })

    expect(issues).toEqual([])
  })

  it('advierte inserts privados sin lista de columnas', () => {
    const warnings = findUserIdWriteContractWarnings({
      privateTables: ['notes'],
      sources: [
        {
          file: 'netlify/functions/notes.mts',
          source: `
            await sql\`
              INSERT INTO notes VALUES (\${id}, \${content})
            \`
          `,
        },
      ],
    })

    expect(warnings).toEqual([
      {
        file: 'netlify/functions/notes.mts',
        table: 'notes',
        kind: 'insert_without_column_list',
        message:
          'netlify/functions/notes.mts usa INSERT INTO notes sin lista de columnas; no se puede verificar user_id estaticamente.',
      },
    ])
  })

  it('advierte inserts privados INSERT ... SELECT para revisión manual', () => {
    const warnings = findUserIdWriteContractWarnings({
      privateTables: ['notes'],
      sources: [
        {
          file: 'netlify/functions/import.mts',
          source: `
            await sql\`
              INSERT INTO notes (content, title, user_id)
              SELECT content, title, owner_id FROM imported_notes
            \`
          `,
        },
      ],
    })

    expect(warnings).toEqual([
      {
        file: 'netlify/functions/import.mts',
        table: 'notes',
        kind: 'insert_select_manual_review',
        message:
          'netlify/functions/import.mts usa INSERT INTO notes ... SELECT; verifica que user_id venga del owner autenticado.',
      },
    ])
  })

  it('separa warnings aceptados con razón explícita de warnings pendientes', () => {
    const report = buildUserIdWriteContractReport({
      privateTables: ['quotes', 'notes'],
      sources: [
        {
          file: 'netlify/functions/_lib/recortes-endpoint.ts',
          source: `
            await sql\`
              INSERT INTO quotes (text, user_id)
              SELECT text, \${userId} FROM current_recorte
            \`
          `,
        },
        {
          file: 'netlify/functions/notes.mts',
          source: `
            await sql\`
              INSERT INTO notes (content, user_id)
              SELECT content, owner_id FROM imported_notes
            \`
          `,
        },
      ],
    })

    expect(report.warnings).toBe(1)
    expect(report.acceptedWarnings).toBe(1)
    expect(report.acceptedWarningDetails).toEqual([
      expect.objectContaining({
        file: 'netlify/functions/_lib/recortes-endpoint.ts',
        table: 'quotes',
        reason: expect.stringContaining('recorte owner'),
      }),
    ])
  })

  it('acepta whatsapp_pending_media porque user_id viene de parámetros autenticados antes del unnest', () => {
    const report = buildUserIdWriteContractReport({
      privateTables: ['whatsapp_pending_media'],
      sources: [
        {
          file: 'netlify/functions/_lib/whatsapp/pending-media.ts',
          source: `
            await sql\`
              INSERT INTO whatsapp_pending_media (
                user_id, phone_e164, group_id, storage_key, mime, captured_at, caption
              )
              SELECT \${userId}, \${phone}, \${groupId}::uuid, x.key, x.mime,
                x.captured_at::timestamptz, \${caption}
              FROM unnest(\${keys}::text[], \${mimes}::text[], \${capturedAts}::text[])
                AS x(key, mime, captured_at)
            \`
          `,
        },
      ],
    })

    expect(report.warnings).toBe(0)
    expect(report.acceptedWarnings).toBe(1)
    expect(report.acceptedWarningDetails[0]).toMatchObject({
      file: 'netlify/functions/_lib/whatsapp/pending-media.ts',
      table: 'whatsapp_pending_media',
      reason: expect.stringContaining('authenticated userId parameter'),
    })
  })

  it('trata warnings no aceptados como findings bloqueantes', () => {
    const report = buildUserIdWriteContractReport({
      privateTables: ['notes'],
      warningAllowlist: [],
      sources: [
        {
          file: 'netlify/functions/notes.mts',
          source: `
            await sql\`
              INSERT INTO notes (content, user_id)
              SELECT content, owner_id FROM imported_notes
            \`
          `,
        },
      ],
    })

    expect(report.warnings).toBe(1)
    expect(hasBlockingUserIdWriteFindings(report)).toBe(true)
  })
})
