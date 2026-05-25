/**
 * Barrel del subsistema LLM. Mantiene la superficie pública que tenía
 * el llm.ts monolítico para que los call sites legacy sigan funcionando
 * sin cambio. El archivo `_lib/llm.ts` re-exporta desde acá.
 *
 * Estructura del subsistema (DD5, mismo patrón que BB2 con src/api/):
 *   types.ts        → tipos públicos (LLMProvider, LLMMessage, etc.)
 *   config.ts       → PROVIDER_DEFAULTS + readers de env vars
 *   cache.ts        → in-memory cache + hashMessages + clearLLMCache
 *   retry.ts        → sleep + fetchWithRetry
 *   providers/      → un archivo por API:
 *     openai-compatible.ts  → OpenAI + DeepSeek (clones)
 *     anthropic.ts          → Claude
 *     gemini.ts             → Google Gemini (+ vision)
 *   dispatch.ts     → resolveProvider + askLLMForJson/Text/TextStreaming/Vision
 */

export { clearLLMCache } from './cache.js'
export {
  askLLMForJson,
  askLLMForText,
  askLLMForTextStreaming,
  askLLMForVision,
} from './dispatch.js'
export type {
  LLMMessage,
  LLMOverride,
  LLMProvider,
  LLMResult,
  LLMUsage,
  StreamFrame,
} from './types.js'
