/**
 * Google Gemini provider. Diferencias:
 *   - endpoint /models/:model:generateContent
 *   - API key como query param (?key=…) en vez de header
 *   - systemInstruction separado
 *   - roles: 'assistant' → 'model'
 *   - response JSON via generationConfig.responseMimeType
 *   - vision via inlineData en el content
 */

import type { LLMMessage, ProviderConfig, RawResult } from '../types.js'
import { fetchWithRetry } from '../retry.js'

export async function askGemini(
  apiKey: string,
  config: ProviderConfig,
  messages: LLMMessage[],
  maxTokens: number,
  mode: 'json' | 'text',
): Promise<RawResult> {
  const system = messages.find((m) => m.role === 'system')?.content ?? ''
  // Gemini acepta una secuencia chat-like bajo `contents`. Roles: 'assistant' → 'model'.
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

export async function askGeminiVision(
  apiKey: string,
  config: ProviderConfig,
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  mimeType: string,
  maxTokens: number,
): Promise<RawResult> {
  const response = await fetchWithRetry(() =>
    fetch(`${config.baseUrl}/models/${config.model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: userText }, { inlineData: { mimeType, data: imageBase64 } }],
          },
        ],
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
    throw new Error(`Gemini vision error ${response.status}: ${errorText}`)
  }
  const data = (await response.json()) as {
    candidates: { content: { parts: { text: string }[] } }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini vision no devolvió texto')
  return {
    content: JSON.parse(text),
    tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
  }
}
