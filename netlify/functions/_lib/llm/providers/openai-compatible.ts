/**
 * OpenAI-compatible providers: OpenAI canonical + DeepSeek (que clona la API).
 * Mismo endpoint /chat/completions, mismo shape de response.
 *
 * Soporta tanto JSON mode (response_format) como texto plano, y vision
 * via image_url en el message content array.
 */

import type { LLMMessage, ProviderConfig, RawResult } from '../types.js'
import { fetchWithRetry } from '../retry.js'

/**
 * Los modelos nuevos de OpenAI (familia gpt-5* y la serie o1/o3/o4) cambiaron
 * la API de /chat/completions: exigen `max_completion_tokens` en vez de
 * `max_tokens` (manda 400 `unsupported_parameter` si usás el viejo) y sólo
 * aceptan la temperatura por defecto. DeepSeek y los gpt-4* siguen con
 * `max_tokens` + temperatura libre, así que el switch es por nombre de modelo.
 */
export function isNewOpenAIModel(model: string): boolean {
  return /^(gpt-5|o[1-9])/i.test(model)
}
function tokenParamFor(model: string): 'max_tokens' | 'max_completion_tokens' {
  return isNewOpenAIModel(model) ? 'max_completion_tokens' : 'max_tokens'
}

export async function askOpenAICompatible(
  apiKey: string,
  config: ProviderConfig,
  messages: LLMMessage[],
  maxTokens: number,
  mode: 'json' | 'text',
): Promise<RawResult> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    [tokenParamFor(config.model)]: maxTokens,
  }
  // Los modelos nuevos sólo aceptan la temperatura por defecto; al resto les
  // fijamos una baja para JSON/extracción y una media para texto.
  if (!isNewOpenAIModel(config.model)) {
    body.temperature = mode === 'json' ? 0.2 : 0.6
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

export async function askOpenAIVision(
  apiKey: string,
  config: ProviderConfig,
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  mimeType: string,
  maxTokens: number,
): Promise<RawResult> {
  const dataUrl = `data:${mimeType};base64,${imageBase64}`
  const visionBody: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    [tokenParamFor(config.model)]: maxTokens,
  }
  if (!isNewOpenAIModel(config.model)) visionBody.temperature = 0.2
  const response = await fetchWithRetry(() =>
    fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(visionBody),
    }),
  )
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI vision error ${response.status}: ${errorText}`)
  }
  const data = (await response.json()) as {
    choices: { message: { content: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenAI vision no devolvió contenido')
  return {
    content: JSON.parse(text),
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
  }
}
