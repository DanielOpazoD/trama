/**
 * Per-task LLM provider resolution.
 *
 * Each call site (extract, suggest, reclassify, reflect, chat, vision, panel)
 * declares its task. resolveTaskProvider() looks up ai_task_providers; if no
 * row exists, falls back to the env-var default. Returns provider + optional
 * model override + optional cross-verification provider.
 */

import { getSql } from './db.js'

export type AITask =
  | 'extract'
  | 'extract-image'
  | 'suggest-relationships'
  | 'reclassify'
  | 'reflect'
  | 'chat'
  | 'panel'
  | 'voz'

export const ALL_TASKS: AITask[] = [
  'extract',
  'extract-image',
  'suggest-relationships',
  'reclassify',
  'reflect',
  'chat',
  'panel',
  'voz',
]

export type ResolvedTask = {
  task: AITask
  provider: string
  model: string | null
  verifyWith: string | null
}

type Row = {
  task: string
  provider: string
  model: string | null
  verify_with: string | null
}

// Cache per-user. La migración 20260526 movió la PK de `(task)` a
// `(user_id, task)` y queremos respetarlo: la configuración de uno no
// se filtra al otro. Cache `Map<userId, { at, map }>`.
type UserCache = { at: number; map: Map<string, Row> }
const cache = new Map<string, UserCache>()
const CACHE_TTL_MS = 30_000

async function loadAll(userId: string): Promise<Map<string, Row>> {
  const cached = cache.get(userId)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.map
  const sql = getSql()
  const rows = (await sql`
    SELECT task, provider, model, verify_with
    FROM ai_task_providers
    WHERE user_id = ${userId}
  `.catch(() => [])) as Row[]
  const map = new Map(rows.map((r) => [r.task, r]))
  cache.set(userId, { at: Date.now(), map })
  return map
}

/**
 * Invalida el cache de un usuario (después de un PUT a /api/ai-settings).
 * Si se omite, se borra el cache completo — útil para tests que
 * mockean DB. */
export function invalidateAITaskCache(userId?: string): void {
  if (userId) cache.delete(userId)
  else cache.clear()
}

/**
 * Returns the configured provider + optional model + optional verifier for
 * this task. If no DB row exists, both default to "use the env-var
 * AI_PROVIDER" (returned as provider = '' so the caller knows to fall back).
 */
export async function resolveTaskProvider(
  task: AITask,
  userId: string,
): Promise<ResolvedTask> {
  const map = await loadAll(userId)
  const row = map.get(task)
  if (!row) {
    return { task, provider: '', model: null, verifyWith: null }
  }
  return {
    task,
    provider: row.provider,
    model: row.model,
    verifyWith: row.verify_with,
  }
}
