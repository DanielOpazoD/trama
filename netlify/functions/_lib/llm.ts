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
  role: 'system' | 'user'
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
  const provider = readProvider()
  const apiKey = readApiKey()
  const config = PROVIDER_DEFAULTS[provider]
  const maxTokens = readMaxTokens()
  const cacheTtl = readCacheTtlSeconds()

  const cacheKey = await hashMessages(messages, provider)
  const cached = getCached(cacheKey)
  if (cached) return cached

  const start = Date.now()
  let raw: RawResult
  if (provider === 'gemini') {
    raw = await askGemini(apiKey, config, messages, maxTokens)
  } else if (provider === 'anthropic') {
    raw = await askAnthropic(apiKey, config, messages, maxTokens)
  } else {
    raw = await askOpenAICompatible(apiKey, config, messages, maxTokens)
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
): Promise<RawResult> {
  const response = await fetchWithRetry(() =>
    fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
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
    content: JSON.parse(text),
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
  }
}

async function askAnthropic(
  apiKey: string,
  config: ProviderConfig,
  messages: LLMMessage[],
  maxTokens: number,
): Promise<RawResult> {
  const system = messages.find((m) => m.role === 'system')?.content ?? ''
  const userMessages = messages
    .filter((m) => m.role === 'user')
    .map((m) => ({ role: 'user' as const, content: m.content }))

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
        system: system + '\n\nRespond ONLY with a JSON object. No markdown, no commentary.',
        messages: userMessages,
        max_tokens: maxTokens,
        temperature: 0.2,
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
    content: JSON.parse(text),
    tokensIn: data.usage?.input_tokens ?? 0,
    tokensOut: data.usage?.output_tokens ?? 0,
  }
}

async function askGemini(
  apiKey: string,
  config: ProviderConfig,
  messages: LLMMessage[],
  maxTokens: number,
): Promise<RawResult> {
  const system = messages.find((m) => m.role === 'system')?.content ?? ''
  const userText = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n\n')

  const response = await fetchWithRetry(() =>
    fetch(`${config.baseUrl}/models/${config.model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: maxTokens,
        },
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
    content: JSON.parse(text),
    tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
  }
}
