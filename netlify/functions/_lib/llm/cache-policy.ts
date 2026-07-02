import { getCached, hashMessages, putCached } from './cache.js'
import { getCachedFromDB, putCachedToDB } from './db-cache.js'
import type { ChainLink } from './provider-chain.js'
import type { LLMMessage, LLMOverride, LLMProvider, LLMResult } from './types.js'

export function buildLLMCacheScope({
  provider,
  model,
  mode,
  freshNonce = '',
}: {
  provider: LLMProvider
  model: string
  mode: 'json' | 'text'
  freshNonce?: string | number
}): string {
  return `${provider}|${model}|${mode}|${freshNonce}`
}

export function buildPrimaryLLMCacheScope(
  primary: ChainLink,
  mode: 'json' | 'text',
  override?: LLMOverride,
): string {
  return buildLLMCacheScope({
    provider: primary.provider,
    model: primary.config.model,
    mode,
    freshNonce: override?.freshNonce,
  })
}

export async function buildPrimaryLLMCacheKey({
  messages,
  primary,
  mode,
  override,
}: {
  messages: LLMMessage[]
  primary: ChainLink
  mode: 'json' | 'text'
  override?: LLMOverride
}): Promise<string> {
  return hashMessages(messages, buildPrimaryLLMCacheScope(primary, mode, override))
}

export async function readLLMCache(
  cacheKey: string,
  cacheTtl: number,
): Promise<LLMResult | null> {
  const cached = getCached(cacheKey)
  if (cached) return cached

  const dbCached = await getCachedFromDB(cacheKey)
  if (!dbCached) return null

  putCached(cacheKey, dbCached, cacheTtl)
  return dbCached
}

export function writeLLMCacheBestEffort({
  cacheKey,
  result,
  cacheTtl,
}: {
  cacheKey: string
  result: LLMResult
  cacheTtl: number
}) {
  putCached(cacheKey, result, cacheTtl)
  void putCachedToDB(cacheKey, result, cacheTtl)
}
