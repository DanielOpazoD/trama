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

export const ALL_TASKS: AITask[] = [
  'extract',
  'extract-image',
  'suggest-relationships',
  'reclassify',
  'reflect',
  'chat',
  'panel',
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

let cache: { at: number; map: Map<string, Row> } | null = null
const CACHE_TTL_MS = 30_000

async function loadAll(): Promise<Map<string, Row>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.map
  const sql = getSql()
  const rows = (await sql`
    SELECT task, provider, model, verify_with FROM ai_task_providers
  `.catch(() => [])) as Row[]
  const map = new Map(rows.map((r) => [r.task, r]))
  cache = { at: Date.now(), map }
  return map
}

/** Drop the in-memory cache (used after a settings update so the next call sees it). */
export function invalidateAITaskCache(): void {
  cache = null
}

/**
 * Returns the configured provider + optional model + optional verifier for
 * this task. If no DB row exists, both default to "use the env-var
 * AI_PROVIDER" (returned as provider = '' so the caller knows to fall back).
 */
export async function resolveTaskProvider(task: AITask): Promise<ResolvedTask> {
  const map = await loadAll()
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
