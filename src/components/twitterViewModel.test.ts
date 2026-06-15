import { describe, expect, it } from 'vitest'
import type { XBookmark } from '../api'
import {
  UNCLASSIFIED_TOPIC,
  buildTwitterFacets,
  filterTwitterBookmarks,
  monthName,
} from './twitterViewModel'

function bookmark(input: Partial<XBookmark> & Pick<XBookmark, 'id' | 'text'>): XBookmark {
  return {
    tweetId: input.id,
    authorName: input.authorName ?? null,
    authorUsername: input.authorUsername ?? null,
    tweetCreatedAt: input.tweetCreatedAt ?? null,
    url: input.url ?? null,
    capturedAt: input.capturedAt ?? '2026-06-15T12:00:00.000Z',
    topic: input.topic ?? null,
    ...input,
  }
}

describe('twitterViewModel', () => {
  it('deriva facetas por año, mes, tema y autor', () => {
    const facets = buildTwitterFacets([
      bookmark({
        id: 'b1',
        text: 'React y diseño',
        authorUsername: 'ana',
        tweetCreatedAt: '2026-06-10T10:00:00.000Z',
        topic: 'frontend',
      }),
      bookmark({
        id: 'b2',
        text: 'Postgres',
        authorUsername: 'ana',
        tweetCreatedAt: '2026-05-10T10:00:00.000Z',
      }),
      bookmark({
        id: 'b3',
        text: 'Literatura',
        authorUsername: 'bea',
        tweetCreatedAt: '2025-06-10T10:00:00.000Z',
        topic: 'lectura',
      }),
    ])

    expect(facets.years).toEqual([2026, 2025])
    expect(facets.monthsForYear(2026)).toEqual([5, 4])
    expect(facets.byYear.get(2026)?.count).toBe(2)
    expect(facets.topicCounts).toEqual([
      ['frontend', 1],
      ['lectura', 1],
    ])
    expect(facets.unclassified).toBe(1)
    expect(facets.authors).toEqual([
      ['ana', 2],
      ['bea', 1],
    ])
  })

  it('filtra por fecha, tema, autor y búsqueda textual', () => {
    const items = [
      bookmark({
        id: 'b1',
        text: 'React y diseño',
        authorName: 'Ana',
        authorUsername: 'ana',
        tweetCreatedAt: '2026-06-10T10:00:00.000Z',
        topic: 'frontend',
      }),
      bookmark({
        id: 'b2',
        text: 'Postgres',
        authorName: 'Bea',
        authorUsername: 'bea',
        tweetCreatedAt: '2026-05-10T10:00:00.000Z',
      }),
    ]

    expect(
      filterTwitterBookmarks(items, {
        year: 2026,
        month: 5,
        topic: 'frontend',
        author: 'ana',
        query: 'diseño',
      }).map((b) => b.id),
    ).toEqual(['b1'])

    expect(
      filterTwitterBookmarks(items, {
        year: null,
        month: null,
        topic: UNCLASSIFIED_TOPIC,
        author: null,
        query: 'bea',
      }).map((b) => b.id),
    ).toEqual(['b2'])
  })

  it('mantiene los nombres de meses en español', () => {
    expect(monthName(5)).toBe('junio')
  })
})
