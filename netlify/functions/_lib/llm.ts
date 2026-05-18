/**
 * Provider-agnostic LLM call.
 *
 * Reads two env vars:
 *   AI_PROVIDER  → 'deepseek' | 'openai' | 'gemini' | 'anthropic'  (default: 'deepseek')
 *   AI_API_KEY   → the API key for the chosen provider
 *
 * The DeepSeek, OpenAI, and Anthropic implementations share the OpenAI-compatible
 * chat-completions shape (Anthropic uses messages API but the wrapper here normalizes).
 * Gemini uses its own REST shape and is normalized in the same wrapper.
 *
 * Returns the model's response as a JS object parsed from JSON. The caller is
 * responsible for validating the shape against its expected schema.
 */

export type LLMProvider = 'deepseek' | 'openai' | 'gemini' | 'anthropic'

export type LLMMessage = {
  role: 'system' | 'user'
  content: string
}

const PROVIDER_DEFAULTS: Record<
  LLMProvider,
  { baseUrl: string; model: string }
> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-haiku-4-5-20251001',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
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

/**
 * Sends a JSON-mode request to the configured LLM.
 * Returns the parsed JSON object from the model's response.
 */
export async function askLLMForJson(messages: LLMMessage[]): Promise<unknown> {
  const provider = readProvider()
  const apiKey = readApiKey()
  const config = PROVIDER_DEFAULTS[provider]

  if (provider === 'gemini') {
    return askGemini(apiKey, config, messages)
  }
  if (provider === 'anthropic') {
    return askAnthropic(apiKey, config, messages)
  }
  // deepseek and openai share the OpenAI chat-completions schema
  return askOpenAICompatible(apiKey, config, messages)
}

async function askOpenAICompatible(
  apiKey: string,
  config: { baseUrl: string; model: string },
  messages: LLMMessage[],
): Promise<unknown> {
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
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('LLM no devolvió contenido')
  return JSON.parse(content)
}

async function askAnthropic(
  apiKey: string,
  config: { baseUrl: string; model: string },
  messages: LLMMessage[],
): Promise<unknown> {
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
  }
  const text = data.content?.find((c) => c.type === 'text')?.text
  if (!text) throw new Error('Anthropic no devolvió texto')
  return JSON.parse(text)
}

async function askGemini(
  apiKey: string,
  config: { baseUrl: string; model: string },
  messages: LLMMessage[],
): Promise<unknown> {
  const system = messages.find((m) => m.role === 'system')?.content ?? ''
  const userText = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n\n')

  const response = await fetch(
    `${config.baseUrl}/models/${config.model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
    },
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini error ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as {
    candidates: { content: { parts: { text: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini no devolvió texto')
  return JSON.parse(text)
}
