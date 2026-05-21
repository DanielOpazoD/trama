/**
 * Provider-agnostic LLM call with retry, in-memory cache, and cost reporting.
 *
 * Reads env vars:
 *   AI_PROVIDER  → 'deepseek' | 'openai' | 'gemini' | 'anthropic'  (default 'deepseek')
 *   AI_API_KEY   → API key for the chosen provider
 *   AI_MAX_TOKENS → optional cap on completion tokens (default 4096)
 *   AI_CACHE_TTL_SECONDS → optional in-memory cache TTL (default 600)
 *
 * Returns { content, usage, fromCache }.
 */

export type LLMProvider = 'deepseek' | 'openai' | 'gemini' | 'anthropic'

export type LLMMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type LLMUsage = {
  provider: LLMProvider
  model: string
  tokensIn: number
  tokensOut: number
  costCents: number
  durationMs: number
}

export type LLMResult = {
  content: unknown
  usage: LLMUsage
  fromCache: boolean
}

type ProviderConfig = {
  baseUrl: string
  model: string
  costPerMillionIn: number
  costPerMillionOut: number
}

const PROVIDER_DEFAULTS: Record<LLMProvider, ProviderConfig> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    costPerMillionIn: 14,
    costPerMillionOut: 28,
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    costPerMillionIn: 15,
    costPerMillionOut: 60,
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-haiku-4-5-20251001',
    costPerMillionIn: 100,
    costPerMillionOut: 500,
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    costPerMillionIn: 7.5,
    costPerMillionOut: 30,
  },
}

function readProvider(): LLMProvider {
  const raw = (Netlify.env.get('AI_PROVIDER') ?? 'deepseek').toLowerCase()
  if (raw === 'openai' || raw === 'gemini' || raw === 'anthropic' || raw === 'deepseek') {
    return raw
  }
  throw new Error(`AI_PROVIDER no reconocido: ${raw}`)
}

function readApiKey(): string {
  const key = Netlify.env.get('AI_API_KEY')
  if (!key) throw new Error('AI_API_KEY no está configurada en el entorno')
  return key
}

function readMaxTokens(): number {
  const raw = Netlify.env.get('AI_MAX_TOKENS')
  const n = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : 4096
}

function readCacheTtlSeconds(): number {
  const raw = Netlify.env.get('AI_CACHE_TTL_SECONDS')
  const n = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 600
}

function computeCostCents(usage: { tokensIn: number; tokensOut: number }, config: ProviderConfig): number {
  return (
    (usage.tokensIn * config.costPerMillionIn) / 1_000_000 +
    (usage.tokensOut * config.costPerMillionOut) / 1_000_000
  )
}

// ---------- In-memory cache ----------
// Per-function-instance only. For a stronger cache across cold starts, use Netlify Blobs.

type CacheEntry = { value: LLMResult; expiresAt: number }
const cache = new Map<string, CacheEntry>()

/** Clear all cached LLM responses. Useful in tests. */
export function clearLLMCache(): void {
  cache.clear()
}

async function hashMessages(messages: LLMMessage[], provider: string): Promise<string> {
  const json = JSON.stringify({ provider, messages })
  const buf = new TextEncoder().encode(json)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function getCached(key: string): LLMResult | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return { ...entry.value, fromCache: true }
}

function putCached(key: string, value: LLMResult, ttlSeconds: number): void {
  if (ttlSeconds <= 0) return
  cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  // Cheap LRU-ish: cap cache size so a long-running instance doesn't bloat.
  if (cache.size > 200) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

// ---------- Retry with exponential backoff ----------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type FetchAttempt = () => Promise<Response>

/**
 * Retry on 5xx and 429. Bail immediately on 4xx (likely a code or auth bug).
 * Backoff: 0, 1s, 4s.
 */
async function fetchWithRetry(makeRequest: FetchAttempt, retries = 2): Promise<Response> {
  const delays = [0, 1000, 4000]
  let lastError: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (delays[attempt] > 0) await sleep(delays[attempt])
    try {
      const response = await makeRequest()
      if (response.ok) return response
      // Retry only on transient server-side issues.
      if (response.status >= 500 || response.status === 429) {
        lastError = new Error(`HTTP ${response.status}`)
        continue
      }
      return response // 4xx — caller will format the error
    } catch (err) {
      lastError = err
      // Network error — keep trying.
    }
  }
  if (lastError instanceof Error) throw lastError
  throw new Error('LLM fetch failed after retries')
}

// ---------- Main entry ----------

export async function askLLMForJson(messages: LLMMessage[]): Promise<LLMResult> {
  return callLLM(messages, 'json')
}

/**
 * Like askLLMForJson but returns the model's reply as raw text (not parsed).
 * Used by the chat where the assistant produces prose with an optional fenced
 * JSON trailer for structured proposals.
 */
export async function askLLMForText(messages: LLMMessage[]): Promise<LLMResult> {
  return callLLM(messages, 'text')
}

/**
 * Streaming variant of askLLMForText. Yields content chunks as they arrive
 * from the provider, then a final 'done' frame carrying usage info and the
 * full assembled content.
 *
 * Currently implemented for OpenAI-compatible providers (DeepSeek default).
 * For Anthropic and Gemini we fall back to the non-streaming path and emit
 * the full reply as a single chunk so the consumer's contract is identical.
 */
export type StreamFrame =
  | { type: 'chunk'; content: string }
  | { type: 'done'; content: string; usage: LLMUsage }
  | { type: 'error'; message: string }

export async function* askLLMForTextStreaming(
  messages: LLMMessage[],
): AsyncGenerator<StreamFrame, void, void> {
  const provider = readProvider()
  const apiKey = readApiKey()
  const config = PROVIDER_DEFAULTS[provider]
  const maxTokens = readMaxTokens()

  const start = Date.now()

  if (provider === 'gemini' || provider === 'anthropic') {
    // No native streaming wired up for these yet — surface the whole reply
    // as a single chunk so the consumer's API is uniform.
    try {
      const result = await callLLM(messages, 'text')
      const content = typeof result.content === 'string' ? result.content : String(result.content)
      yield { type: 'chunk', content }
      yield { type: 'done', content, usage: result.usage }
    } catch (err) {
      yield { type: 'error', message: err instanceof Error ? err.message : String(err) }
    }
    return
  }

  // OpenAI-compatible streaming via SSE.
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
      // Each block can have multiple `data:` lines; OpenAI uses one per chunk.
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

async function callLLM(
  messages: LLMMessage[],
  mode: 'json' | 'text',
): Promise<LLMResult> {
  const provider = readProvider()
  const apiKey = readApiKey()
  const config = PROVIDER_DEFAULTS[provider]
  const maxTokens = readMaxTokens()
  const cacheTtl = readCacheTtlSeconds()

  const cacheKey = await hashMessages(messages, `${provider}|${mode}`)
  const cached = getCached(cacheKey)
  if (cached) return cached

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
  return result
}

type RawResult = { content: unknown; tokensIn: number; tokensOut: number }

async function askOpenAICompatible(
  apiKey: string,
  config: ProviderConfig,
  messages: LLMMessage[],
  maxTokens: number,
  mode: 'json' | 'text',
): Promise<RawResult> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: mode === 'json' ? 0.2 : 0.6,
    max_tokens: maxTokens,
  }
  if (mode === 'json') body.response_format = { type: 'json_object' }

  const response = await fetchWithRetry(() =>
    fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    }),
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM error ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('LLM no devolvió contenido')
  return {
    content: mode === 'json' ? JSON.parse(text) : text,
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
  }
}

async function askAnthropic(
  apiKey: string,
  config: ProviderConfig,
  messages: LLMMessage[],
  maxTokens: number,
  mode: 'json' | 'text',
): Promise<RawResult> {
  const system = messages.find((m) => m.role === 'system')?.content ?? ''
  const nonSystemMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const systemPrompt =
    mode === 'json'
      ? system + '\n\nRespond ONLY with a JSON object. No markdown, no commentary.'
      : system

  const response = await fetchWithRetry(() =>
    fetch(`${config.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        system: systemPrompt,
        messages: nonSystemMessages,
        max_tokens: maxTokens,
        temperature: mode === 'json' ? 0.2 : 0.6,
      }),
    }),
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Anthropic error ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as {
    content: { type: string; text: string }[]
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const text = data.content?.find((c) => c.type === 'text')?.text
  if (!text) throw new Error('Anthropic no devolvió texto')
  return {
    content: mode === 'json' ? JSON.parse(text) : text,
    tokensIn: data.usage?.input_tokens ?? 0,
    tokensOut: data.usage?.output_tokens ?? 0,
  }
}

async function askGemini(
  apiKey: string,
  config: ProviderConfig,
  messages: LLMMessage[],
  maxTokens: number,
  mode: 'json' | 'text',
): Promise<RawResult> {
  const system = messages.find((m) => m.role === 'system')?.content ?? ''
  // Gemini accepts a chat-like sequence under `contents`. Map roles: 'assistant' → 'model'.
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  const generationConfig: Record<string, unknown> = {
    temperature: mode === 'json' ? 0.2 : 0.6,
    maxOutputTokens: maxTokens,
  }
  if (mode === 'json') generationConfig.responseMimeType = 'application/json'

  const response = await fetchWithRetry(() =>
    fetch(`${config.baseUrl}/models/${config.model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig,
      }),
    }),
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini error ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as {
    candidates: { content: { parts: { text: string }[] } }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini no devolvió texto')
  return {
    content: mode === 'json' ? JSON.parse(text) : text,
    tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
  }
}
