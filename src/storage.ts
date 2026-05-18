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

function ensureOrigin<T extends { origin?: Origin }>(item: T): T & { origin: Origin } {
  return { ...item, origin: item.origin ?? 'manual' }
}

export const storage = {
  loadEntities: () => loadRaw<Entity>(KEYS.entities).map(ensureOrigin),
  saveEntities: (items: Entity[]) => save(KEYS.entities, items),
  loadRelationships: () => loadRaw<Relationship>(KEYS.relationships).map(ensureOrigin),
  saveRelationships: (items: Relationship[]) => save(KEYS.relationships, items),
  loadQuotes: () => loadRaw<Quote>(KEYS.quotes).map(ensureOrigin),
  saveQuotes: (items: Quote[]) => save(KEYS.quotes, items),
}
