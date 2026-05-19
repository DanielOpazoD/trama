/**
 * Provider-agnostic LLM call.
 *
 * Reads two env vars:
 *   AI_PROVIDER  → 'deepseek' | 'openai' | 'gemini' | 'anthropic'  (default: 'deepseek')
 *   AI_API_KEY   → the API key for the chosen provider
 *
 * Returns the parsed JSON content AND usage metadata (tokens + estimated cost).
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
  content: unknown // parsed JSON
  usage: LLMUsage
}

type ProviderConfig = {
  baseUrl: string
  model: string
  /** Cost per million tokens, in USD cents. */
  costPerMillionIn: number
  costPerMillionOut: number
}

const PROVIDER_DEFAULTS: Record<LLMProvider, ProviderConfig> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    costPerMillionIn: 14, // ~$0.14 per M
    costPerMillionOut: 28, // ~$0.28 per M
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
    costPerMillionIn: 100, // approx for Haiku
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
  if (!key) {
    throw new Error('AI_API_KEY no está configurada en el entorno')
  }
  return key
}

function computeCostCents(usage: { tokensIn: number; tokensOut: number }, config: ProviderConfig): number {
  return (
    (usage.tokensIn * config.costPerMillionIn) / 1_000_000 +
    (usage.tokensOut * config.costPerMillionOut) / 1_000_000
  )
}

export async function askLLMForJson(messages: LLMMessage[]): Promise<LLMResult> {
  const provider = readProvider()
  const apiKey = readApiKey()
  const config = PROVIDER_DEFAULTS[provider]
  const start = Date.now()

  let content: unknown
  let tokensIn = 0
  let tokensOut = 0

  if (provider === 'gemini') {
    const result = await askGemini(apiKey, config, messages)
    content = result.content
    tokensIn = result.tokensIn
    tokensOut = result.tokensOut
  } else if (provider === 'anthropic') {
    const result = await askAnthropic(apiKey, config, messages)
    content = result.content
    tokensIn = result.tokensIn
    tokensOut = result.tokensOut
  } else {
    const result = await askOpenAICompatible(apiKey, config, messages)
    content = result.content
    tokensIn = result.tokensIn
    tokensOut = result.tokensOut
  }

  return {
    content,
    usage: {
      provider,
      model: config.model,
      tokensIn,
      tokensOut,
      costCents: computeCostCents({ tokensIn, tokensOut }, config),
      durationMs: Date.now() - start,
    },
  }
}

type RawResult = { content: unknown; tokensIn: number; tokensOut: number }

async function askOpenAICompatible(apiKey: string, config: ProviderConfig, messages: LLMMessage[]): Promise<RawResult> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  })

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

async function askAnthropic(apiKey: string, config: ProviderConfig, messages: LLMMessage[]): Promise<RawResult> {
  const system = messages.find((m) => m.role === 'system')?.content ?? ''
  const userMessages = messages
    .filter((m) => m.role === 'user')
    .map((m) => ({ role: 'user' as const, content: m.content }))

  const response = await fetch(`${config.baseUrl}/messages`, {
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
      max_tokens: 4096,
      temperature: 0.2,
    }),
  })

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

async function askGemini(apiKey: string, config: ProviderConfig, messages: LLMMessage[]): Promise<RawResult> {
  const system = messages.find((m) => m.role === 'system')?.content ?? ''
  const userText = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n\n')

  const response = await fetch(
    `${config.baseUrl}/models/${config.model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    },
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
