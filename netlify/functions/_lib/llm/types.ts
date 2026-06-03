/**
 * Tipos públicos del subsistema LLM. Se exportan desde `_lib/llm.ts`
 * (barrel) para que los call sites legacy sigan funcionando.
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

export type ProviderConfig = {
  baseUrl: string
  model: string
  costPerMillionIn: number
  costPerMillionOut: number
}

/**
 * Optional per-call override. Usado por callers task-aware para elegir
 * un provider+modelo específico en una invocación particular, en vez del
 * env default. Empty/undefined → env vars.
 */
export type LLMOverride = {
  provider?: string
  model?: string | null
  /**
   * η2: nonce que se incluye en el hash del cache. Cuando el caller quiere
   * variedad (e.g. "descubrir IA" tras descartar sugerencias), pasa un
   * valor único (Date.now() típicamente) y el cache se bypassa
   * efectivamente para esa llamada.
   */
  freshNonce?: string | number
}

export type StreamFrame =
  | { type: 'chunk'; content: string }
  // `fromCache`: el reply salió del cache (los providers no-streaming caen a
  // callLLM, que puede dar un hit). El caller lo usa para no re-cobrar el
  // presupuesto por tokens que no se compraron.
  | { type: 'done'; content: string; usage: LLMUsage; fromCache: boolean }
  | { type: 'error'; message: string }

/** Shape devuelta por cada provider antes de envolverse en LLMResult. */
export type RawResult = { content: unknown; tokensIn: number; tokensOut: number }
