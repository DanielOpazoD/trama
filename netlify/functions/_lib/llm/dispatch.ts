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
  readDedicatedKey,
  readFallbackProviders,
  readMaxTokens,
  readVisionProvider,
} from './config.js'
import { LLMTransientError } from './retry.js'
import { logEvent } from '../observability.js'
import {
  askOpenAICompatible,
  askOpenAIVision,
  openOpenAICompatibleStream,
} from './providers/openai-compatible.js'
import { askAnthropic } from './providers/anthropic.js'
import { askGemini, askGeminiVision } from './providers/gemini.js'
import type {
  LLMMessage,
  LLMOverride,
  LLMResult,
  LLMUsage,
  ProviderConfig,
  RawResult,
  StreamFrame,
} from './types.js'
import { parseOpenAICompatibleSseBlock } from './streaming.js'
import { buildProviderChain, resolveProvider, type ChainLink } from './provider-chain.js'
import {
  buildPrimaryLLMCacheKey,
  buildVisionLLMCacheKey,
  readLLMCache,
  writeLLMCacheBestEffort,
} from './cache-policy.js'

/** Una sola llamada a un provider concreto. Envuelve el RawResult en LLMResult. */
async function callOneProvider(
  link: ChainLink,
  messages: LLMMessage[],
  mode: 'json' | 'text',
  maxTokens: number,
): Promise<LLMResult> {
  const { provider, apiKey, config } = link
  const start = Date.now()
  let raw: RawResult
  if (provider === 'gemini') {
    raw = await askGemini(apiKey, config, messages, maxTokens, mode)
  } else if (provider === 'anthropic') {
    raw = await askAnthropic(apiKey, config, messages, maxTokens, mode)
  } else {
    raw = await askOpenAICompatible(apiKey, config, messages, maxTokens, mode)
  }
  return {
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
}

async function callLLM(
  messages: LLMMessage[],
  mode: 'json' | 'text',
  override?: LLMOverride,
): Promise<LLMResult> {
  const maxTokens = readMaxTokens()
  const cacheTtl = readCacheTtlSeconds()
  const chain = buildProviderChain(override)
  const primary = chain[0]
  if (!primary) throw new Error('No se pudo resolver ningún provider LLM.')

  // η2: freshNonce participa del cache key — si el caller lo pasa, cada
  // call con nonce distinto evita el cache. Útil para "descubrir IA" donde
  // el usuario espera variedad entre clicks. El key se ancla al provider
  // primario; si un fallback responde, su resultado se cachea bajo ese mismo
  // key — así el próximo request idéntico no vuelve a fallar contra el primario.
  const cacheKey = await buildPrimaryLLMCacheKey({ messages, primary, mode, override })
  const cached = await readLLMCache({ cacheKey, cacheTtl })
  if (cached) return cached

  // Recorre la cadena: ante una falla TRANSITORIA (5xx/timeout/red) cae al
  // siguiente provider; ante una permanente (4xx auth/bad-request, o JSON
  // inválido) re-lanza sin enmascarar.
  let lastError: unknown
  for (const [i, link] of chain.entries()) {
    try {
      const result = await callOneProvider(link, messages, mode, maxTokens)
      if (i > 0) {
        logEvent({
          event: 'llm_fallback_succeeded',
          primary: primary.provider,
          used: link.provider,
          mode,
        })
      }
      writeLLMCacheBestEffort({ cacheKey, result, cacheTtl })
      return result
    } catch (err) {
      lastError = err
      const transient = err instanceof LLMTransientError
      const hasNext = i < chain.length - 1
      if (transient && hasNext) {
        logEvent({
          event: 'llm_provider_failed',
          provider: link.provider,
          willFallback: true,
          message: err instanceof Error ? err.message : String(err),
        })
        continue
      }
      throw err
    }
  }
  // Inalcanzable (el loop siempre retorna o lanza), pero satisface a TS.
  throw lastError instanceof Error
    ? lastError
    : new Error('LLM falló sin error capturado')
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
      yield { type: 'done', content, usage: result.usage, fromCache: result.fromCache }
    } catch (err) {
      yield { type: 'error', message: err instanceof Error ? err.message : String(err) }
    }
    return
  }

  // OpenAI-compatible streaming vía SSE.
  let response: Response
  try {
    response = await openOpenAICompatibleStream(apiKey, config, messages, maxTokens)
  } catch (err) {
    // Falla transitoria al abrir el stream: si hay fallback configurado, cae
    // a la cadena no-streaming (callLLM) y emite la respuesta en un solo chunk
    // para no romper el chat. Un solo extra-intento contra el primario es
    // aceptable en este camino raro.
    if (err instanceof LLMTransientError && readFallbackProviders().length > 0) {
      try {
        const result = await callLLM(messages, 'text', override)
        const content =
          typeof result.content === 'string' ? result.content : String(result.content)
        yield { type: 'chunk', content }
        yield { type: 'done', content, usage: result.usage, fromCache: result.fromCache }
        return
      } catch {
        /* cae al frame de error de abajo */
      }
    }
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
      for (const frame of parseOpenAICompatibleSseBlock(eventBlock)) {
        if (typeof frame.content === 'string') {
          assembled += frame.content
          yield { type: 'chunk', content: frame.content }
        } else {
          tokensIn = frame.tokensIn ?? tokensIn
          tokensOut = frame.tokensOut ?? tokensOut
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
  // El stream SSE real siempre pega al provider (no pasa por cache).
  yield { type: 'done', content: assembled, usage, fromCache: false }
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
  const cacheKey = await buildVisionLLMCacheKey({
    provider,
    systemPrompt,
    userText,
    imageBase64,
  })
  const cached = await readLLMCache({ cacheKey, cacheTtl })
  if (cached) return cached

  // Cadena de visión: primario + el otro provider vision-capable (openai↔gemini)
  // si está en AI_FALLBACK_PROVIDERS y tiene key dedicada. Vision solo soporta
  // estos dos, así que la cadena tiene a lo sumo dos eslabones.
  type VisionLink = {
    provider: 'openai' | 'gemini'
    apiKey: string
    config: ProviderConfig
  }
  const visionChain: VisionLink[] = [{ provider, apiKey, config }]
  const other: 'openai' | 'gemini' = provider === 'openai' ? 'gemini' : 'openai'
  if (readFallbackProviders().includes(other)) {
    const otherKey = readDedicatedKey(other)
    if (otherKey) {
      visionChain.push({
        provider: other,
        apiKey: otherKey,
        config: PROVIDER_DEFAULTS[other],
      })
    }
  }

  const callOneVision = async (link: VisionLink): Promise<LLMResult> => {
    const start = Date.now()
    const raw: RawResult =
      link.provider === 'openai'
        ? await askOpenAIVision(
            link.apiKey,
            link.config,
            systemPrompt,
            userText,
            imageBase64,
            mimeType,
            maxTokens,
          )
        : await askGeminiVision(
            link.apiKey,
            link.config,
            systemPrompt,
            userText,
            imageBase64,
            mimeType,
            maxTokens,
          )
    return {
      content: raw.content,
      usage: {
        provider: link.provider,
        model: link.config.model,
        tokensIn: raw.tokensIn,
        tokensOut: raw.tokensOut,
        costCents: computeCostCents(raw, link.config),
        durationMs: Date.now() - start,
      },
      fromCache: false,
    }
  }

  let lastError: unknown
  for (const [i, link] of visionChain.entries()) {
    try {
      const result = await callOneVision(link)
      if (i > 0) {
        logEvent({
          event: 'llm_vision_fallback_succeeded',
          primary: provider,
          used: link.provider,
        })
      }
      writeLLMCacheBestEffort({ cacheKey, result, cacheTtl })
      return result
    } catch (err) {
      lastError = err
      if (err instanceof LLMTransientError && i < visionChain.length - 1) {
        logEvent({
          event: 'llm_vision_provider_failed',
          provider: link.provider,
          willFallback: true,
          message: err instanceof Error ? err.message : String(err),
        })
        continue
      }
      throw err
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Vision falló sin error capturado')
}
