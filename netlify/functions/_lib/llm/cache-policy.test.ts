import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChainLink } from './provider-chain'
import type { LLMResult } from './types'

const cacheMocks = vi.hoisted(() => ({
  getCached: vi.fn(),
  hashMessages: vi.fn(),
  putCached: vi.fn(),
  getCachedFromDB: vi.fn(),
  putCachedToDB: vi.fn(),
}))

vi.mock('./cache.js', () => ({
  getCached: cacheMocks.getCached,
  hashMessages: cacheMocks.hashMessages,
  putCached: cacheMocks.putCached,
}))

vi.mock('./db-cache.js', () => ({
  getCachedFromDB: cacheMocks.getCachedFromDB,
  putCachedToDB: cacheMocks.putCachedToDB,
}))

import {
  buildLLMCacheScope,
  buildPrimaryLLMCacheKey,
  buildPrimaryLLMCacheScope,
  buildVisionLLMCacheKey,
  buildVisionLLMCacheScope,
  readLLMCache,
  writeLLMCacheBestEffort,
} from './cache-policy'

const primary: ChainLink = {
  provider: 'deepseek',
  apiKey: 'k',
  config: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    pricing: { inputCentsPerMTok: 1, outputCentsPerMTok: 2 },
  },
}

const result: LLMResult = {
  content: { ok: true },
  usage: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    tokensIn: 1,
    tokensOut: 2,
    costCents: 0.01,
    durationMs: 3,
  },
  fromCache: false,
}

beforeEach(() => {
  cacheMocks.getCached.mockReset()
  cacheMocks.hashMessages.mockReset()
  cacheMocks.putCached.mockReset()
  cacheMocks.getCachedFromDB.mockReset()
  cacheMocks.putCachedToDB.mockReset()
})

describe('llm cache policy', () => {
  it('construye scopes estables por provider/model/mode', () => {
    expect(
      buildLLMCacheScope({
        provider: 'deepseek',
        model: 'deepseek-chat',
        mode: 'json',
      }),
    ).toBe('deepseek|deepseek-chat|json|')
  })

  it('incluye freshNonce para saltar cache entre llamadas intencionalmente frescas', () => {
    expect(
      buildLLMCacheScope({
        provider: 'openai',
        model: 'gpt-4o-mini',
        mode: 'text',
        freshNonce: 'click-2',
      }),
    ).toBe('openai|gpt-4o-mini|text|click-2')
  })

  it('construye scope/key primarios usando provider, modelo, modo y nonce', async () => {
    cacheMocks.hashMessages.mockResolvedValue('hashed-primary')
    const messages = [{ role: 'user' as const, content: 'hola' }]

    expect(buildPrimaryLLMCacheScope(primary, 'json', { freshNonce: 42 })).toBe(
      'deepseek|deepseek-chat|json|42',
    )
    await expect(
      buildPrimaryLLMCacheKey({
        messages,
        primary,
        mode: 'json',
        override: { freshNonce: 42 },
      }),
    ).resolves.toBe('hashed-primary')
    expect(cacheMocks.hashMessages).toHaveBeenCalledWith(
      messages,
      'deepseek|deepseek-chat|json|42',
    )
  })

  it('centraliza scope/key de vision preservando el formato legacy', async () => {
    cacheMocks.hashMessages.mockResolvedValue('hashed-vision')

    expect(buildVisionLLMCacheScope('openai')).toBe('openai|vision')
    await expect(
      buildVisionLLMCacheKey({
        provider: 'openai',
        systemPrompt: 'sys',
        userText: 'user',
        imageBase64: 'abcdef'.repeat(20),
      }),
    ).resolves.toBe('hashed-vision')
    expect(cacheMocks.hashMessages).toHaveBeenCalledWith(
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: `user:${'abcdef'.repeat(20).slice(0, 64)}` },
      ],
      'openai|vision',
    )
  })

  it('lee primero memoria y solo consulta DB en miss', async () => {
    cacheMocks.getCached.mockReturnValue(result)

    await expect(readLLMCache({ cacheKey: 'k1', cacheTtl: 60 })).resolves.toBe(result)
    expect(cacheMocks.getCachedFromDB).not.toHaveBeenCalled()
    expect(cacheMocks.putCached).not.toHaveBeenCalled()
  })

  it('hot-fillea memoria cuando encuentra resultado en DB', async () => {
    cacheMocks.getCached.mockReturnValue(null)
    cacheMocks.getCachedFromDB.mockResolvedValue(result)

    await expect(readLLMCache({ cacheKey: 'k2', cacheTtl: 60 })).resolves.toBe(result)
    expect(cacheMocks.putCached).toHaveBeenCalledWith('k2', result, 60)
  })

  it('persiste escrituras en memoria y DB best-effort', () => {
    writeLLMCacheBestEffort({ cacheKey: 'k3', result, cacheTtl: 120 })

    expect(cacheMocks.putCached).toHaveBeenCalledWith('k3', result, 120)
    expect(cacheMocks.putCachedToDB).toHaveBeenCalledWith('k3', result, 120)
  })
})
