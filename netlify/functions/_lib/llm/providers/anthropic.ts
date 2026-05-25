/**
 * Anthropic Claude provider. Diferencias respecto a OpenAI:
 *   - endpoint /messages (no /chat/completions)
 *   - system prompt va separado (no como role:'system' message)
 *   - sin response_format JSON, hay que pedirlo en el system prompt
 *   - headers: x-api-key + anthropic-version
 */

import type { LLMMessage, ProviderConfig, RawResult } from '../types.js'
import { fetchWithRetry } from '../retry.js'

export async function askAnthropic(
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
