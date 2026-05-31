import { describe, expect, it } from 'vitest'
import { loadChatContextForFocus } from './chat-context'

type SqlTag = Parameters<typeof loadChatContextForFocus>[0]

function makeSqlMock(responder: (sqlText: string, values: unknown[]) => unknown): SqlTag {
  return ((strings: TemplateStringsArray, ...values: unknown[]) =>
    Promise.resolve(responder(strings.join(' '), values))) as SqlTag
}

describe('loadChatContextForFocus', () => {
  it('shapes focused context and falls back when type catalogs contain only blank slugs', async () => {
    const sql = makeSqlMock((sqlText) => {
      if (sqlText.includes('FROM entities') && sqlText.includes('SELECT id, name')) {
        return [
          {
            id: 'e1',
            name: 'Borges',
            type: 'escritor',
            year: 1899,
            description: 'Laberintos, espejos, tiempo.',
          },
        ]
      }
      if (sqlText.includes('FROM relationships r')) {
        return [
          {
            id: 'r1',
            from_name: 'Borges',
            to_name: 'Calvino',
            type: 'influye_en',
            notes: 'Lecturas cruzadas.',
          },
        ]
      }
      if (sqlText.includes('FROM quotes q')) {
        return [
          {
            id: 'q1',
            entity_name: 'Borges',
            text: 'El tiempo es la sustancia de que estoy hecho.',
            source: 'Otras inquisiciones',
          },
        ]
      }
      if (sqlText.includes('FROM entity_types')) return [{ slug: '   ' }]
      if (sqlText.includes('FROM relationship_types')) return [{ slug: '' }]
      return []
    })

    const loaded = await loadChatContextForFocus(sql, 'e1', 'user-1')

    expect(loaded.tramaContext).toEqual({
      entities: [
        {
          id: 'e1',
          name: 'Borges',
          type: 'escritor',
          year: 1899,
          description: 'Laberintos, espejos, tiempo.',
        },
      ],
      relationships: [
        {
          id: 'r1',
          fromName: 'Borges',
          toName: 'Calvino',
          type: 'influye_en',
          notes: 'Lecturas cruzadas.',
        },
      ],
      quotes: [
        {
          id: 'q1',
          entityName: 'Borges',
          text: 'El tiempo es la sustancia de que estoy hecho.',
          source: 'Otras inquisiciones',
        },
      ],
    })
    expect(loaded.entityTypes).toContain('persona')
    expect(loaded.relationshipTypes).toContain('influye_en')
    expect(loaded.entityTypes).not.toContain('')
    expect(loaded.relationshipTypes).not.toContain('')
    expect(loaded.usedRag).toBe(false)
    expect(loaded.usedHyde).toBe(false)
  })
})
