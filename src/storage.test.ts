import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { storage } from './storage'

// Minimal in-memory localStorage stub.
function makeLocalStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('storage.loadEntities', () => {
  it('returns empty array when storage is empty', () => {
    expect(storage.loadEntities()).toEqual([])
  })

  it('returns parsed entities when present', () => {
    const stored = [
      {
        id: 'e1',
        type: 'persona',
        name: 'Camus',
        origin: { kind: 'manual' },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]
    localStorage.setItem('trama:entities:v1', JSON.stringify(stored))
    const result = storage.loadEntities()
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('Camus')
  })

  it('normalizes legacy string origin to object', () => {
    const stored = [
      {
        id: 'e1',
        type: 'persona',
        name: 'Camus',
        origin: 'ai',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]
    localStorage.setItem('trama:entities:v1', JSON.stringify(stored))
    const [entity] = storage.loadEntities()
    expect(entity!.origin).toEqual({ kind: 'ai' })
  })

  it('treats unknown legacy origin strings as manual', () => {
    const stored = [
      {
        id: 'e1',
        type: 'persona',
        name: 'Camus',
        origin: 'something-weird',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]
    localStorage.setItem('trama:entities:v1', JSON.stringify(stored))
    const [entity] = storage.loadEntities()
    expect(entity!.origin).toEqual({ kind: 'manual' })
  })

  it('falls back to createdAt when updatedAt is missing', () => {
    const stored = [
      {
        id: 'e1',
        type: 'persona',
        name: 'Camus',
        origin: { kind: 'manual' },
        createdAt: '2026-01-01T00:00:00Z',
        // no updatedAt
      },
    ]
    localStorage.setItem('trama:entities:v1', JSON.stringify(stored))
    const [entity] = storage.loadEntities()
    expect(entity!.updatedAt).toBe('2026-01-01T00:00:00Z')
  })

  it('returns empty array when JSON is corrupted', () => {
    localStorage.setItem('trama:entities:v1', 'not-json-{}}}')
    expect(storage.loadEntities()).toEqual([])
  })

  it('preserves existing origin object', () => {
    const stored = [
      {
        id: 'e1',
        type: 'persona',
        name: 'Camus',
        origin: { kind: 'ai', provider: 'deepseek', model: 'deepseek-chat' },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]
    localStorage.setItem('trama:entities:v1', JSON.stringify(stored))
    const [entity] = storage.loadEntities()
    expect(entity!.origin).toEqual({
      kind: 'ai',
      provider: 'deepseek',
      model: 'deepseek-chat',
    })
  })
})

describe('storage round-trip', () => {
  it('saves then loads same entities', () => {
    const entities = [
      {
        id: 'e1',
        type: 'persona' as const,
        name: 'Camus',
        origin: { kind: 'manual' as const },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]
    storage.saveEntities(entities)
    const loaded = storage.loadEntities()
    expect(loaded).toEqual(entities)
  })
})
