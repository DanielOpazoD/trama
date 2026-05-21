import type { Entity, Origin, Quote, Relationship } from './types'

const KEYS = {
  entities: 'trama:entities:v1',
  relationships: 'trama:relationships:v1',
  quotes: 'trama:quotes:v1',
}

function loadRaw<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

function save<T>(key: string, items: T[]): void {
  localStorage.setItem(key, JSON.stringify(items))
}

/**
 * Coerce legacy localStorage shapes into the current type.
 * - `origin` used to be 'manual' | 'ai' string. Now it's an object.
 * - `updatedAt` may be missing on old rows — fall back to `createdAt`.
 */
function normalizeOrigin(value: unknown): Origin {
  if (value && typeof value === 'object' && 'kind' in (value as Record<string, unknown>)) {
    return value as Origin
  }
  if (typeof value === 'string') {
    return { kind: value === 'ai' ? 'ai' : 'manual' }
  }
  return { kind: 'manual' }
}

function normalizeBase<T extends { createdAt: string; updatedAt?: string; origin?: unknown }>(
  item: T,
): T & { origin: Origin; updatedAt: string } {
  return {
    ...item,
    origin: normalizeOrigin(item.origin),
    updatedAt: item.updatedAt ?? item.createdAt,
  }
}

function normalizeQuote(item: Partial<Quote> & { id: string; entityId: string; text: string; createdAt: string }): Quote {
  return {
    ...normalizeBase(item as Quote),
    linkedQuoteIds: Array.isArray(item.linkedQuoteIds) ? item.linkedQuoteIds : [],
  }
}

export const storage = {
  loadEntities: () => loadRaw<Entity>(KEYS.entities).map(normalizeBase),
  saveEntities: (items: Entity[]) => save(KEYS.entities, items),
  loadRelationships: () => loadRaw<Relationship>(KEYS.relationships).map(normalizeBase),
  saveRelationships: (items: Relationship[]) => save(KEYS.relationships, items),
  loadQuotes: () => loadRaw<Quote>(KEYS.quotes).map(normalizeQuote),
  saveQuotes: (items: Quote[]) => save(KEYS.quotes, items),
}
