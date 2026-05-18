import type { Entity, Quote, Relationship } from './types'

const KEYS = {
  entities: 'trama:entities:v1',
  relationships: 'trama:relationships:v1',
  quotes: 'trama:quotes:v1',
}

function load<T>(key: string): T[] {
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

export const storage = {
  loadEntities: () => load<Entity>(KEYS.entities),
  saveEntities: (items: Entity[]) => save(KEYS.entities, items),
  loadRelationships: () => load<Relationship>(KEYS.relationships),
  saveRelationships: (items: Relationship[]) => save(KEYS.relationships, items),
  loadQuotes: () => load<Quote>(KEYS.quotes),
  saveQuotes: (items: Quote[]) => save(KEYS.quotes, items),
}
