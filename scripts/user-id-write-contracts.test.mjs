import { describe, expect, it } from 'vitest'
import { findUserIdWriteContractIssues } from './user-id-write-contracts.mjs'

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
})
