import { describe, expect, it } from 'vitest'
import {
  buildUserIdWriteContractReport,
  findUserIdWriteContractIssues,
  findUserIdWriteContractWarnings,
  hasBlockingUserIdWriteFindings,
} from './user-id-write-contracts.mjs'

const insertSelectWarning = (file, table) => ({
  file,
  table,
  kind: 'insert_select_manual_review',
  message: `${file} usa INSERT INTO ${table} ... SELECT; verifica que user_id venga del owner autenticado.`,
})

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
      insertSelectWarning('netlify/functions/import.mts', 'notes'),
    ])
  })

  it('acepta INSERT ... SELECT cuando user_id viene directamente del parámetro autenticado', () => {
    const warnings = findUserIdWriteContractWarnings({
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

    expect(warnings).toEqual([])
  })

  it('acepta INSERT ... SELECT sin FROM cuando user_id viene del parámetro autenticado', () => {
    const warnings = findUserIdWriteContractWarnings({
      privateTables: ['favoritos'],
      sources: [
        {
          file: 'netlify/functions/favoritos.mts',
          source: `
            await sql\`
              INSERT INTO favoritos (url, title, note, user_id)
              SELECT \${url}, \${title ?? null}, \${note ?? null}, \${userId}
              WHERE NOT EXISTS (SELECT 1 FROM existing)
              RETURNING id, url, title, note, created_at, updated_at
            \`
          `,
        },
      ],
    })

    expect(warnings).toEqual([])
  })

  it('acepta INSERT ... SELECT cuando user_id viene de un alias owner-gated', () => {
    const warnings = findUserIdWriteContractWarnings({
      privateTables: ['recorte_images'],
      sources: [
        {
          file: 'netlify/functions/_lib/whatsapp/album.ts',
          source: `
            await sql\`
              WITH rec AS (
                SELECT id, image_key, user_id FROM recortes
                WHERE id = \${recorteId} AND user_id = \${userId} AND deleted_at IS NULL
              ),
              appended AS (
                INSERT INTO recorte_images (recorte_id, user_id, storage_key, mime, position)
                SELECT rec.id, rec.user_id, x.key, x.mime, x.ord::int
                FROM rec,
                  unnest(\${keys}::text[], \${mimes}::text[]) WITH ORDINALITY AS x(key, mime, ord)
                RETURNING 1
              )
              SELECT 1
            \`
          `,
        },
      ],
    })

    expect(warnings).toEqual([])
  })

  it('advierte cuando el parámetro autenticado está en otra posición del SELECT', () => {
    const warnings = findUserIdWriteContractWarnings({
      privateTables: ['notes'],
      sources: [
        {
          file: 'netlify/functions/notes.mts',
          source: `
            await sql\`
              INSERT INTO notes (user_id, title)
              SELECT owner_id, \${userId} FROM imported_notes
            \`
          `,
        },
      ],
    })

    expect(warnings).toEqual([
      insertSelectWarning('netlify/functions/notes.mts', 'notes'),
    ])
  })

  it('advierte alias.user_id cuando el alias no está owner-gated', () => {
    const warnings = findUserIdWriteContractWarnings({
      privateTables: ['recorte_images'],
      sources: [
        {
          file: 'netlify/functions/_lib/whatsapp/album.ts',
          source: `
            await sql\`
              WITH rec AS (
                SELECT id, image_key, user_id FROM recortes
                WHERE id = \${recorteId} AND deleted_at IS NULL
              ),
              appended AS (
                INSERT INTO recorte_images (recorte_id, user_id, storage_key)
                SELECT rec.id, rec.user_id, x.key
                FROM rec, unnest(\${keys}::text[]) AS x(key)
                RETURNING 1
              )
              SELECT 1
            \`
          `,
        },
      ],
    })

    expect(warnings).toEqual([
      insertSelectWarning('netlify/functions/_lib/whatsapp/album.ts', 'recorte_images'),
    ])
  })

  it('advierte cuando el owner-gate pertenece a otro alias', () => {
    const warnings = findUserIdWriteContractWarnings({
      privateTables: ['recorte_images'],
      sources: [
        {
          file: 'netlify/functions/_lib/whatsapp/album.ts',
          source: `
            await sql\`
              WITH safe AS (
                SELECT id, user_id FROM recortes
                WHERE id = \${recorteId} AND user_id = \${userId} AND deleted_at IS NULL
              ),
              unsafe AS (
                SELECT id, user_id FROM recortes
                WHERE id = \${otherRecorteId} AND deleted_at IS NULL
              ),
              appended AS (
                INSERT INTO recorte_images (recorte_id, user_id, storage_key)
                SELECT safe.id, unsafe.user_id, x.key
                FROM safe, unsafe, unnest(\${keys}::text[]) AS x(key)
                RETURNING 1
              )
              SELECT 1
            \`
          `,
        },
      ],
    })

    expect(warnings).toEqual([
      insertSelectWarning('netlify/functions/_lib/whatsapp/album.ts', 'recorte_images'),
    ])
  })

  it('advierte SELECT user_id si el mismo statement no filtra user_id por el usuario autenticado', () => {
    const warnings = findUserIdWriteContractWarnings({
      privateTables: ['prompts'],
      sources: [
        {
          file: 'netlify/functions/prompts.mts',
          source: `
            await sql\`
              WITH unrelated AS (
                SELECT id FROM users WHERE user_id = \${userId}
              )
              INSERT INTO prompts (title, user_id)
              SELECT title, user_id
              FROM prompts
              WHERE id = \${id} AND deleted_at IS NULL
            \`
          `,
        },
      ],
    })

    expect(warnings).toEqual([
      insertSelectWarning('netlify/functions/prompts.mts', 'prompts'),
    ])
  })

  it('mantiene probados los 10 fixtures que antes vivían en allowlist manual', () => {
    const report = buildUserIdWriteContractReport({
      privateTables: [
        'quotes',
        'momentos',
        'recorte_images',
        'whatsapp_pending_media',
        'momento_entities',
        'favoritos',
        'prompts',
      ],
      sources: [
        {
          file: 'netlify/functions/_lib/recortes-endpoint.ts',
          source: `
            await sql\`
              INSERT INTO quotes (entity_id, text, user_id)
              SELECT \${entityId}::uuid, \${text}, \${userId}
              FROM current_recorte cr
              JOIN entities e
                ON e.id = \${entityId}::uuid
               AND e.deleted_at IS NULL
               AND e.user_id = \${userId}
              WHERE cr.status <> 'promoted'
              RETURNING id
            \`

            await sql\`
              INSERT INTO momentos (kind, captured_at, payload, user_id)
              SELECT \${kind}, \${capturedAt}::timestamptz, \${payload}::jsonb, \${userId}
              FROM current_recorte cr
              WHERE cr.status <> 'promoted'
              RETURNING id
            \`
          `,
        },
        {
          file: 'netlify/functions/_lib/whatsapp/album.ts',
          source: `
            await sql\`
              WITH rec AS (
                SELECT id, image_key, user_id FROM recortes
                WHERE id = \${recorteId} AND user_id = \${userId} AND deleted_at IS NULL
              ),
              cover AS (
                INSERT INTO recorte_images (recorte_id, user_id, storage_key, mime, position)
                SELECT rec.id, rec.user_id, rec.image_key, 'image/jpeg', 0
                FROM rec
                WHERE rec.image_key IS NOT NULL
                RETURNING 1
              ),
              appended AS (
                INSERT INTO recorte_images (recorte_id, user_id, storage_key, mime, position)
                SELECT rec.id, rec.user_id, x.key, x.mime, x.ord::int
                FROM rec,
                  unnest(\${keys}::text[], \${mimes}::text[]) WITH ORDINALITY AS x(key, mime, ord)
                RETURNING 1
              )
              SELECT 1
            \`
          `,
        },
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
              RETURNING 1
            \`
          `,
        },
        {
          file: 'netlify/functions/entities-merge.mts',
          source: `
            await sql\`
              INSERT INTO momento_entities (momento_id, entity_id, user_id)
              SELECT momento_id, \${keepId}, \${userId} FROM momento_entities
              WHERE entity_id = ANY(\${mergeIds}::uuid[])
                AND user_id = \${userId}
                AND deleted_at IS NULL
              ON CONFLICT (momento_id, entity_id) DO UPDATE
              SET user_id = EXCLUDED.user_id, deleted_at = NULL
            \`
          `,
        },
        {
          file: 'netlify/functions/favoritos.mts',
          source: `
            await sql\`
              INSERT INTO favoritos (url, title, note, user_id)
              SELECT \${url}, \${title ?? null}, \${note ?? null}, \${userId}
              WHERE NOT EXISTS (SELECT 1 FROM existing)
              RETURNING id
            \`
          `,
        },
        {
          file: 'netlify/functions/momentos-merge.mts',
          source: `
            await sql\`
              INSERT INTO momento_entities (momento_id, entity_id, user_id)
              SELECT \${primaryId}::uuid, entity_id, \${userId}
              FROM momento_entities
              WHERE momento_id = ANY(\${otherIds}::uuid[])
                AND user_id = \${userId}
                AND deleted_at IS NULL
              ON CONFLICT (momento_id, entity_id) DO UPDATE
              SET user_id = EXCLUDED.user_id, deleted_at = NULL
            \`
          `,
        },
        {
          file: 'netlify/functions/_lib/momentos/data.ts',
          source: `
            await sql\`
              INSERT INTO momento_entities (momento_id, entity_id, user_id)
              SELECT \${momentoId}::uuid, e_id, \${ownerUserId} FROM desired
              ON CONFLICT (momento_id, entity_id) DO UPDATE
              SET user_id = EXCLUDED.user_id, deleted_at = NULL
            \`

            await sql\`
              WITH ins AS (
                INSERT INTO momentos (kind, captured_at, payload, user_id)
                VALUES (\${kind}, \${capturedAt}::timestamptz, \${payload}::jsonb, \${userId})
                RETURNING id
              ),
              link AS (
                INSERT INTO momento_entities (momento_id, entity_id, user_id)
                SELECT (SELECT id FROM ins), e_id, \${userId}
                FROM unnest(\${entityIds}::uuid[]) AS e_id
                ON CONFLICT (momento_id, entity_id) DO UPDATE
                SET user_id = EXCLUDED.user_id, deleted_at = NULL
              )
              SELECT id FROM ins
            \`
          `,
        },
        {
          file: 'netlify/functions/notes.mts',
          source: `
            await sql\`
              WITH note_to_promote AS (
                SELECT created_at
                FROM notes
                WHERE id = \${id} AND deleted_at IS NULL AND user_id = \${userId}
              ),
              new_momento AS (
                INSERT INTO momentos (kind, captured_at, payload, user_id)
                SELECT 'nota', note_to_promote.created_at, \${payload}::jsonb, \${userId}
                FROM note_to_promote
                RETURNING id
              )
              SELECT id FROM new_momento
            \`
          `,
        },
        {
          file: 'netlify/functions/prompts.mts',
          source: `
            await sql\`
              INSERT INTO prompts (title, content, collection, tags, variables, favorite, user_id)
              SELECT title || ' copia', content, collection, tags, variables, false, user_id
              FROM prompts
              WHERE id = \${id} AND deleted_at IS NULL AND user_id = \${userId}
              RETURNING id
            \`
          `,
        },
      ],
    })

    expect(report).toMatchObject({
      issues: 0,
      warnings: 0,
      acceptedWarnings: 0,
      acceptedWarningDetails: [],
    })
  })

  it('separa warnings aceptados con razón explícita de warnings pendientes', () => {
    const report = buildUserIdWriteContractReport({
      privateTables: ['quotes', 'notes'],
      warningAllowlist: [
        {
          file: 'netlify/functions/_lib/recortes-endpoint.ts',
          table: 'quotes',
          kind: 'insert_select_manual_review',
          reason: 'fixture aceptado para probar el split de warnings',
        },
      ],
      sources: [
        {
          file: 'netlify/functions/_lib/recortes-endpoint.ts',
          source: `
            await sql\`
              INSERT INTO quotes (text, user_id)
              SELECT text, owner_id FROM imported_quotes
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
        reason: 'fixture aceptado para probar el split de warnings',
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
    expect(report.acceptedWarnings).toBe(0)
    expect(report.acceptedWarningDetails).toEqual([])
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
