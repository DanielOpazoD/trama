/**
 * DD6: cache persistente en Postgres para respuestas LLM.
 *
 * El cache in-memory (cache.ts) ya cubre el caso "misma request dentro
 * del mismo Lambda warm". Esta capa cubre el caso "mismo prompt después
 * de un cold start o deploy": en vez de re-pagar los tokens al provider,
 * leemos el resultado del Postgres.
 *
 * El round-trip a Neon es ~15-30ms vs un LLM call de ~1-3s y ~0.05¢.
 * Si el hit rate persistente es ≥1%, ya vale la pena.
 *
 * Diseño:
 *   - Tabla `llm_cache` (ver migración 20260525120000_llm_cache).
 *   - `getCachedFromDB(hash)` → lookup por PK + filtra expires_at.
 *   - `putCachedToDB(hash, value, ttl, provider, model)` → upsert con expires.
 *   - `cleanupExpiredCache(sql)` → DELETE expirados (llamado periódicamente
 *     por un scheduled job o por el caller best-effort).
 *
 * Disable: AI_DB_CACHE_ENABLED=false en env. Útil para tests o si el
 * round-trip a Neon termina siendo costoso para el patrón de uso real.
 */

import { getSql, sqlTyped } from '../db.js'
import { getEnv } from '../env.js'
import type { LLMResult } from './types.js'

function dbCacheEnabled(): boolean {
  // O1: getEnv() ya aplica la semántica "default ON, opt-out con false/0/off".
  return getEnv().AI_DB_CACHE_ENABLED
}

type DbRow = {
  content: unknown
  provider: string
  model: string
  tokens_in: number
  tokens_out: number
  cost_cents: string // numeric arrives as string
  expires_at: string
}

type ExpiredCacheRow = {
  hash: string
}

/**
 * Lookup del cache persistente. Devuelve LLMResult marcado fromCache=true,
 * o null si no hay match o el row expiró. Best-effort: si la DB falla
 * (sin conexión, error transient), devuelve null y se cae al LLM call
 * normal — el cache nunca debe romper el flujo.
 */
export async function getCachedFromDB(hash: string): Promise<LLMResult | null> {
  if (!dbCacheEnabled()) return null
  try {
    const sql = getSql()
    const rows = await sqlTyped<DbRow>(sql`
      SELECT content, provider, model, tokens_in, tokens_out, cost_cents, expires_at
      FROM llm_cache
      WHERE hash = ${hash} AND expires_at > NOW()
      LIMIT 1
    `)
    const row = rows[0]
    if (!row) return null
    return {
      content: row.content,
      usage: {
        provider: row.provider as LLMResult['usage']['provider'],
        model: row.model,
        tokensIn: row.tokens_in,
        tokensOut: row.tokens_out,
        costCents: Number(row.cost_cents),
        durationMs: 0, // no aplica al hit cacheado
      },
      fromCache: true,
    }
  } catch {
    // Silent fail — el cache no debe romper el flujo principal.
    return null
  }
}

/**
 * Persist al cache. Upsert: si el hash ya existe, actualiza expires_at
 * pero conserva el contenido (los hashes incluyen el modelo + prompt,
 * así que contenido idéntico para mismo hash).
 *
 * Best-effort: errores se silencian.
 */
export async function putCachedToDB(
  hash: string,
  value: LLMResult,
  ttlSeconds: number,
): Promise<void> {
  if (!dbCacheEnabled()) return
  if (ttlSeconds <= 0) return
  try {
    const sql = getSql()
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()
    const contentJson = JSON.stringify(value.content)
    await sql`
      INSERT INTO llm_cache (
        hash, provider, model, content, tokens_in, tokens_out, cost_cents, expires_at
      ) VALUES (
        ${hash},
        ${value.usage.provider},
        ${value.usage.model},
        ${contentJson}::jsonb,
        ${value.usage.tokensIn},
        ${value.usage.tokensOut},
        ${value.usage.costCents},
        ${expiresAt}::timestamptz
      )
      ON CONFLICT (hash) DO UPDATE SET
        expires_at = EXCLUDED.expires_at
    `
  } catch {
    // Silent fail.
  }
}

/**
 * Borrar rows expirados. Idempotente. Llamarlo periódicamente desde un
 * scheduled function (por ahora best-effort en cada hit del cache).
 */
export async function cleanupExpiredCache(): Promise<number> {
  if (!dbCacheEnabled()) return 0
  try {
    const sql = getSql()
    const result = await sqlTyped<ExpiredCacheRow>(sql`
      DELETE FROM llm_cache WHERE expires_at < NOW()
      RETURNING hash
    `)
    return result.length
  } catch {
    return 0
  }
}
