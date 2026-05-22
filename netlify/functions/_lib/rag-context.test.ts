import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { buildRagContext } from './rag-context'

// rag-context.ts imports embedSafe from ./embeddings which reads
// Netlify.env. We stub it to a no-op so the semantic branch is skipped
// (returns null) — letting us test the merge + recency fallback purely.

beforeEach(() => {
  vi.stubGlobal('Netlify', {
    env: {
      get: vi.fn(() => undefined),
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

type Tag<S extends TemplateStringsArray> = S

/**
 * Mock SQL client that lets us return different rows depending on which
 * fragment of the template literal we recognize. The signature matches
 * what buildRagContext expects.
 */
function makeSqlMock(responder: (strings: TemplateStringsArray, values: unknown[]) => unknown) {
  return ((strings: TemplateStringsArray, ...values: unknown[]) =>
    Promise.resolve(responder(strings, values))) as unknown as (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>
}

describe('buildRagContext — fallback to recency when embedding key is absent', () => {
  it('returns merged recent entities + recent quotes + their relationships', async () => {
    const recentEntities = [
      { id: 'e1', name: 'Borges', type: 'escritor', year: 1899, description: null },
      { id: 'e2', name: 'Calvino', type: 'escritor', year: 1923, description: null },
    ]
    const recentQuotes = [
      { id: 'q1', entity_name: 'Borges', text: '...', source: null },
    ]
    const rels = [
      { id: 'r1', from_name: 'Borges', to_name: 'Calvino', type: 'influye_en', notes: null },
    ]

    const sql = makeSqlMock((strings) => {
      const joined = strings.join(' ')
      if (joined.includes('FROM entities') && joined.includes('ORDER BY created_at DESC')) {
        return recentEntities
      }
      if (joined.includes('FROM quotes') && joined.includes('ORDER BY q.created_at DESC')) {
        return recentQuotes
      }
      if (joined.includes('FROM relationships') && joined.includes('= ANY')) {
        return rels
      }
      return []
    })

    const ctx = await buildRagContext(sql, 'qué hay de Borges?')
    expect(ctx.entities.map((e) => e.id).sort()).toEqual(['e1', 'e2'])
    expect(ctx.quotes.map((q) => q.id)).toEqual(['q1'])
    expect(ctx.relationships.map((r) => r.id)).toEqual(['r1'])
    expect(ctx.usedRag).toBe(false)
  })

  it('returns no relationships when there are no entities to anchor them to', async () => {
    const sql = makeSqlMock(() => [])
    const ctx = await buildRagContext(sql, 'algo')
    expect(ctx.entities).toEqual([])
    expect(ctx.relationships).toEqual([])
    expect(ctx.quotes).toEqual([])
    expect(ctx.usedRag).toBe(false)
  })

  it('handles empty query gracefully (no embedding, only recency)', async () => {
    const recentE = [{ id: 'e1', name: 'X', type: 'concepto', year: null, description: null }]
    const sql = makeSqlMock((strings) => {
      const j = strings.join(' ')
      if (j.includes('FROM entities')) return recentE
      return []
    })
    const ctx = await buildRagContext(sql, '')
    expect(ctx.entities).toHaveLength(1)
    expect(ctx.usedRag).toBe(false)
  })
})
