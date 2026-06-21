import { describe, expect, it } from 'vitest'
import {
  findUserIdWriteContractIssues,
  findUserIdWriteContractWarnings,
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
})
