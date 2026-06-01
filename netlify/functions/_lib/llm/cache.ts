/**
 * Helpers de cache in-memory de respuestas LLM. Esta capa es
 * per-function-instance y se pierde en cold starts; el cache persistente
 * entre cold starts vive en `_lib/llm/db-cache.ts`.
 */

import type { LLMMessage, LLMResult } from './types.js'

type CacheEntry = { value: LLMResult; expiresAt: number }
const cache = new Map<string, CacheEntry>()

/** Limpia todas las respuestas LLM cacheadas. Útil en tests. */
export function clearLLMCache(): void {
  cache.clear()
}

export async function hashMessages(
  messages: LLMMessage[],
  provider: string,
): Promise<string> {
  const json = JSON.stringify({ provider, messages })
  const buf = new TextEncoder().encode(json)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function getCached(key: string): LLMResult | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return { ...entry.value, fromCache: true }
}

export function putCached(key: string, value: LLMResult, ttlSeconds: number): void {
  if (ttlSeconds <= 0) return
  cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  // Cheap LRU-ish: cap cache size para que una instancia long-running no se infle.
  if (cache.size > 200) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}
