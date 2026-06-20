import { describe, expect, it } from 'vitest'
import {
  applySearchRerank,
  buildEmptySearchPayload,
  buildSearchModePlan,
  buildSearchResponse,
  toRanked,
  type SearchFusedEntry,
} from './search-service.js'

describe('search-service', () => {
  it('derives lexical and semantic branches from the requested mode', () => {
    expect(buildSearchModePlan('hybrid', 15, false)).toEqual({
      wantsLexical: true,
      wantsSemantic: true,
      fusedWidth: 15,
    })
    expect(buildSearchModePlan('lexical', 10, true)).toEqual({
      wantsLexical: true,
      wantsSemantic: false,
      fusedWidth: 20,
    })
    expect(buildSearchModePlan('semantic', 40, true)).toEqual({
      wantsLexical: false,
      wantsSemantic: true,
      fusedWidth: 30,
    })
  })

  it('keeps ranked search entries decoupled from the endpoint', () => {
    expect(toRanked([{ id: 'e1', name: 'Borges' }])).toEqual([
      { id: 'e1', item: { id: 'e1', name: 'Borges' } },
    ])
  })

  it('applies LLM rerank ids without reintroducing unknown candidates', () => {
    const fused = [
      { item: { id: 'a' }, score: 1, ranks: [1] },
      { item: { id: 'b' }, score: 0.5, ranks: [2] },
    ]

    expect(applySearchRerank(fused, ['b', 'missing', 'a'])).toEqual([
      { item: { id: 'b' }, score: 0.5, ranks: [2] },
      { item: { id: 'a' }, score: 1, ranks: [1] },
    ])
    expect(applySearchRerank(fused, null)).toBe(fused)
  })

  it('maps fused entries to the public search response shape', () => {
    const entityEntry: SearchFusedEntry<{
      id: string
      name: string
      type: string
      description: string | null
      year: number | null
    }> = {
      item: {
        id: 'e1',
        name: 'Borges',
        type: 'persona',
        description: null,
        year: 1899,
      },
      score: 1.25,
      ranks: [1, 2],
    }

    const response = buildSearchResponse({
      mode: 'hybrid',
      wantsRerank: true,
      limit: 5,
      entitiesFused: [entityEntry],
      quotesFused: [],
      momentosFused: [],
      cronicasFused: [],
      chatFused: [],
      entitiesReorderedIds: ['e1'],
      quotesReorderedIds: null,
    })

    expect(response).toEqual({
      entities: [
        {
          id: 'e1',
          name: 'Borges',
          type: 'persona',
          description: null,
          year: 1899,
          score: 1.25,
          lexicalRank: 1,
          semanticRank: 2,
          finalRank: 1,
          reranked: true,
          lexical: 0,
          semantic: 0,
        },
      ],
      quotes: [],
      momentos: [],
      cronicas: [],
      chat: [],
      mode: 'hybrid',
      reranked: true,
    })
  })

  it('returns a stable empty payload for blank queries', () => {
    expect(buildEmptySearchPayload()).toEqual({
      entities: [],
      quotes: [],
      momentos: [],
      cronicas: [],
      chat: [],
    })
  })
})
