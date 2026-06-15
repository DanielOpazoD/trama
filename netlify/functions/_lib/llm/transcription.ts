/**
 * Transcripción de audio (notas de voz). Concern aparte del despachador de
 * chat/vision: Whisper es OpenAI-only y tiene su propio endpoint multipart y su
 * propio modelo de costo (por minuto, no por token).
 */

import { PROVIDER_DEFAULTS, readApiKeyFor } from './config.js'
import { transcribeOpenAI } from './providers/openai-compatible.js'
import type { LLMUsage } from './types.js'

/** Modelo de transcripción (Whisper por default; override por env). */
function readTranscriptionModel(): string {
  try {
    return Netlify.env.get('AI_TRANSCRIPTION_MODEL') || 'whisper-1'
  } catch {
    return 'whisper-1'
  }
}

/**
 * Costo estimado de una transcripción. Whisper cobra por MINUTO de audio
 * (~0.6 ¢/min), no por tokens, y no conocemos la duración exacta sin decodear
 * el audio. Estimamos conservadoramente desde el tamaño asumiendo ~3 KB/s
 * (opus de WhatsApp ronda 16-24 kbps). Es para que el cost-cap mensual cuente
 * algo razonable, no una factura exacta.
 */
function estimateTranscriptionCostCents(byteLength: number): number {
  const seconds = byteLength / 3000
  const minutes = seconds / 60
  return Math.max(0.1, minutes * 0.6)
}

/**
 * Transcripción de una nota de voz. Solo OpenAI (Whisper): otros providers
 * tienen APIs de audio distintas que no cableamos. Resuelve la key de OpenAI
 * (con fallback a AI_API_KEY compartida); si no hay key, lanza y el caller cae
 * a su fallback. Devuelve el texto + un usage con costo estimado por minuto.
 */
export async function askLLMForTranscription(
  audio: ArrayBuffer,
  mimeType: string,
  fileName: string,
): Promise<{ text: string; usage: LLMUsage }> {
  const apiKey = readApiKeyFor('openai')
  const baseUrl = PROVIDER_DEFAULTS.openai.baseUrl
  const model = readTranscriptionModel()
  const start = Date.now()
  const { text } = await transcribeOpenAI(
    apiKey,
    { baseUrl },
    audio,
    mimeType,
    model,
    fileName,
  )
  return {
    text,
    usage: {
      provider: 'openai',
      model,
      tokensIn: 0,
      tokensOut: 0,
      costCents: estimateTranscriptionCostCents(audio.byteLength),
      durationMs: Date.now() - start,
    },
  }
}
