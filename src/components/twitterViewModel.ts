import type { XBookmark } from '../api'

export const UNCLASSIFIED_TOPIC = '__none__'

export type TwitterBookmarkFilters = {
  year: number | null
  month: number | null
  topic: string | null
  author: string | null
  query: string
}

export function monthName(m: number): string {
  return new Date(2000, m, 1).toLocaleDateString('es', { month: 'long' })
}

export function buildTwitterFacets(items: XBookmark[]) {
  const byYear = new Map<number, { count: number; months: Map<number, number> }>()
  const topicMap = new Map<string, number>()
  const authorMap = new Map<string, number>()
  let unclassified = 0

  for (const b of items) {
    if (b.tweetCreatedAt) {
      const d = new Date(b.tweetCreatedAt)
      const y = d.getFullYear()
      const m = d.getMonth()
      const entry = byYear.get(y) ?? { count: 0, months: new Map<number, number>() }
      entry.count += 1
      entry.months.set(m, (entry.months.get(m) ?? 0) + 1)
      byYear.set(y, entry)
    }

    if (b.topic) topicMap.set(b.topic, (topicMap.get(b.topic) ?? 0) + 1)
    else unclassified += 1

    if (b.authorUsername) {
      authorMap.set(b.authorUsername, (authorMap.get(b.authorUsername) ?? 0) + 1)
    }
  }

  return {
    byYear,
    years: [...byYear.keys()].sort((a, b) => b - a),
    monthsForYear(year: number | null): number[] {
      if (year == null) return []
      const months = byYear.get(year)?.months
      return months ? [...months.keys()].sort((a, b) => b - a) : []
    },
    topicCounts: [...topicMap.entries()].sort((a, b) => b[1] - a[1]),
    unclassified,
    authors: [...authorMap.entries()].sort((a, b) => b[1] - a[1]),
  }
}

export function filterTwitterBookmarks(
  items: XBookmark[],
  { year, month, topic, author, query }: TwitterBookmarkFilters,
): XBookmark[] {
  const q = query.trim().toLowerCase()
  return items.filter((b) => {
    if (year != null) {
      if (!b.tweetCreatedAt) return false
      const d = new Date(b.tweetCreatedAt)
      if (d.getFullYear() !== year) return false
      if (month != null && d.getMonth() !== month) return false
    }
    if (topic != null) {
      if (topic === UNCLASSIFIED_TOPIC) {
        if (b.topic) return false
      } else if (b.topic !== topic) return false
    }
    if (author != null && b.authorUsername !== author) return false
    if (q) {
      const hay =
        `${b.text} ${b.authorName ?? ''} ${b.authorUsername ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
