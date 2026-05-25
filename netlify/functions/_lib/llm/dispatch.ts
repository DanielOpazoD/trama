/**
 * Despachador del subsistema LLM. Resuelve provider+key+config y rutea
 * a la implementación correcta. Incluye cache, retry, costo, streaming
 * y vision en el mismo punto de entrada.
 *
 * Public API:
 *   - askLLMForJson(messages, override?)
 *   - askLLMForText(messages, override?)
 *   - askLLMForTextStreaming(messages, override?)  // async generator
 *   - askLLMForVision(systemPrompt, userText, imageBase64, mimeType, override?)
 */

import {
  PROVIDER_DEFAULTS,
  computeCostCents,
  readApiKeyFor,
  readCacheTtlSeconds,
  readMaxTokens,
  readProvider,
  readVisionProvider,
} from './config.js'
import { getCached, hashMessages, putCached } from './cache.js'
import { getCachedFromDB, putCachedToDB } from './db-cache.js'
import { fetchWithRetry } from './retry.js'
import { askOpenAICompatible, askOpenAIVision } from './providers/openai-compatible.js'
import { askAnthropic } from './providers/anthropic.js'
import { askGemini, askGeminiVision } from './providers/gemini.js'
import type {
  LLMMessage,
  LLMOverride,
  LLMProvider,
  LLMResult,
  LLMUsage,
  ProviderConfig,
  RawResult,
  StreamFrame,
} from './types.js'

/**
 * Resuelve (provider, apiKey, config) desde override o env. Override.provider
 * inválido cae al env. Override.model swaps in para el modelo del provider.
 */
function resolveProvider(override?: LLMOverride): {
  provider: LLMProvider
  apiKey: string
  config: ProviderConfig
} {
  let provider = readProvider()
  if (override?.provider) {
    const p = override.provider.toLowerCase()
    if (p === 'openai' || p === 'gemini' || p === 'anthropic' || p === 'deepseek') {
      provider = p
    }
  }
  const apiKey = readApiKeyFor(provider)
  const baseConfig = PROVIDER_DEFAULTS[provider]
  const config: ProviderConfig = override?.model
    ? { ...baseConfig, model: override.model }
    : baseConfig
  return { provider, apiKey, config }
}

async function callLLM(
  messages: LLMMessage[],
  mode: 'json' | 'text',
  override?: LLMOverride,
): Promise<LLMResult> {
  const { provider, apiKey, config } = resolveProvider(override)
  const maxTokens = readMaxTokens()
  const cacheTtl = readCacheTtlSeconds()

  // η2: freshNonce participa del cache key — si el caller lo pasa, cada
  // call con nonce distinto evita el cache. Útil para "descubrir IA" donde
  // el usuario espera variedad entre clicks.
  const cacheKey = await hashMessages(
    messages,
    `${provider}|${config.model}|${mode}|${override?.freshNonce ?? ''}`,
  )
  // DD6: dos niveles. 1) Memoria (sub-ms, mismo Lambda warm). 2) Postgres
  // (~15-30ms, sobrevive cold starts y deploys). Solo llamamos al provider
  // si ambas misses.
  const cached = getCached(cacheKey)
  if (cached) return cached
  const dbCached = await getCachedFromDB(cacheKey)
  if (dbCached) {
    // Hot-fill el memory cache para que el próximo hit del mismo Lambda
    // sea sub-ms en vez de pegarle a Postgres otra vez.
    putCached(cacheKey, dbCached, cacheTtl)
    return dbCached
  }

  const start = Date.now()
  let raw: RawResult
  if (provider === 'gemini') {
    raw = await askGemini(apiKey, config, messages, maxTokens, mode)
  } else if (provider === 'anthropic') {
    raw = await askAnthropic(apiKey, config, messages, maxTokens, mode)
  } else {
    raw = await askOpenAICompatible(apiKey, config, messages, maxTokens, mode)
  }

  const result: LLMResult = {
    content: raw.content,
    usage: {
      provider,
      model: config.model,
      tokensIn: raw.tokensIn,
      tokensOut: raw.tokensOut,
      costCents: computeCostCents(raw, config),
      durationMs: Date.now() - start,
    },
    fromCache: false,
  }

  putCached(cacheKey, result, cacheTtl)
  // Persistir a DB best-effort (no await; no debe bloquear el response).
  void putCachedToDB(cacheKey, result, cacheTtl)
  return result
}

export async function askLLMForJson(
  messages: LLMMessage[],
  override?: LLMOverride,
): Promise<LLMResult> {
  return callLLM(messages, 'json', override)
}

/**
 * Como askLLMForJson pero devuelve el reply del modelo como texto raw
 * (no parsed). Usado por el chat donde el assistant produce prose con
 * un trailer JSON opcional para propuestas estructuradas.
 */
export async function askLLMForText(
  messages: LLMMessage[],
  override?: LLMOverride,
): Promise<LLMResult> {
  return callLLM(messages, 'text', override)
}

/**
 * Streaming variant. Yields chunks como llegan del provider; al final
 * un frame 'done' con usage + el content completo.
 *
 * Actualmente OpenAI-compatible (DeepSeek/OpenAI) tiene streaming SSE
 * nativo. Anthropic y Gemini caen a callLLM normal y emiten el reply
 * completo como un solo chunk, manteniendo el contrato API uniforme.
 */
export async function* askLLMForTextStreaming(
  messages: LLMMessage[],
  override?: LLMOverride,
): AsyncGenerator<StreamFrame, void, void> {
  const { provider, apiKey, config } = resolveProvider(override)
  const maxTokens = readMaxTokens()

  const start = Date.now()

  if (provider === 'gemini' || provider === 'anthropic') {
    // No native streaming wired up para estos — single chunk para uniformidad.
    try {
      const result = await callLLM(messages, 'text', override)
      const content =
        typeof result.content === 'string' ? result.content : String(result.content)
      yield { type: 'chunk', content }
      yield { type: 'done', content, usage: result.usage }
    } catch (err) {
      yield { type: 'error', message: err instanceof Error ? err.message : String(err) }
    }
    return
  }

  // OpenAI-compatible streaming vía SSE.
  let response: Response
  try {
    response = await fetchWithRetry(() =>
      fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: true,
          stream_options: { include_usage: true },
          temperature: 0.6,
          max_tokens: maxTokens,
        }),
      }),
    )
  } catch (err) {
    yield { type: 'error', message: err instanceof Error ? err.message : String(err) }
    return
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '')
    yield {
      type: 'error',
      message: `LLM error ${response.status}: ${text.slice(0, 500)}`,
    }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let assembled = ''
  let tokensIn = 0
  let tokensOut = 0

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Process complete SSE events (separated by blank lines).
    let sepIdx: number
    while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
      const eventBlock = buffer.slice(0, sepIdx).trim()
      buffer = buffer.slice(sepIdx + 2)
      if (!eventBlock) continue
      for (const line of eventBlock.split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') continue
        let parsed: {
          choices?: Array<{ delta?: { content?: string } }>
          usage?: { prompt_tokens?: number; completion_tokens?: number }
        }
        try {
          parsed = JSON.parse(payload)
        } catch {
          continue
        }
        const delta = parsed.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta.length > 0) {
          assembled += delta
          yield { type: 'chunk', content: delta }
        }
        if (parsed.usage) {
          tokensIn = parsed.usage.prompt_tokens ?? tokensIn
          tokensOut = parsed.usage.completion_tokens ?? tokensOut
        }
      }
    }
  }

  const usage: LLMUsage = {
    provider,
    model: config.model,
    tokensIn,
    tokensOut,
    costCents: computeCostCents({ tokensIn, tokensOut }, config),
    durationMs: Date.now() - start,
  }
  yield { type: 'done', content: assembled, usage }
}

/**
 * Vision: OCR + extracción estructurada desde imagen. La imagen pasa
 * como base64-encoded data URL. Forzamos JSON mode para parseo limpio.
 */
export async function askLLMForVision(
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  mimeType: string,
  override?: LLMOverride,
): Promise<LLMResult> {
  // Override solo honored si elige un provider vision-capable.
  let provider: 'openai' | 'gemini'
  let apiKey: string
  if (override?.provider === 'openai' || override?.provider === 'gemini') {
    provider = override.provider
    apiKey = readApiKeyFor(provider)
  } else {
    const resolved = readVisionProvider()
    provider = resolved.provider
    apiKey = resolved.apiKey
  }
  const baseConfig = PROVIDER_DEFAULTS[provider]
  const config: ProviderConfig = override?.model
    ? { ...baseConfig, model: override.model }
    : baseConfig
  const maxTokens = readMaxTokens()
  const cacheTtl = readCacheTtlSeconds()

  // Cache por hash de system + user text + image bytes (truncados) — duplicados
  // exactos son raros para vision pero cheap dedupear.
  const cacheKey = await hashMessages(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText + ':' + imageBase64.slice(0, 64) },
    ],
    `${provider}|vision`,
  )
  const cached = getCached(cacheKey)
  if (cached) return cached
  // DD6: cache persistente también para vision. Misma estrategia.
  const dbCached = await getCachedFromDB(cacheKey)
  if (dbCached) {
    putCached(cacheKey, dbCached, cacheTtl)
    return dbCached
  }

  const start = Date.now()
  let raw: RawResult
  if (provider === 'openai') {
    raw = await askOpenAIVision(apiKey, config, systemPrompt, userText, imageBase64, mimeType, maxTokens)
  } else {
    raw = await askGeminiVision(apiKey, config, systemPrompt, userText, imageBase64, mimeType, maxTokens)
  }

  const result: LLMResult = {
    content: raw.content,
    usage: {
      provider,
      model: config.model,
      tokensIn: raw.tokensIn,
      tokensOut: raw.tokensOut,
      costCents: computeCostCents(raw, config),
      durationMs: Date.now() - start,
    },
    fromCache: false,
  }
  putCached(cacheKey, result, cacheTtl)
  void putCachedToDB(cacheKey, result, cacheTtl)
  return result
}
