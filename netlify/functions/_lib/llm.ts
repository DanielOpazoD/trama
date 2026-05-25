/**
 * Barrel legacy del subsistema LLM. Mantiene el path `./_lib/llm.js`
 * que los handlers ya importan, ahora respaldado por el split modular
 * `./_lib/llm/` (DD5).
 *
 * Si vas a agregar features (provider nuevo, modo nuevo), editá los
 * archivos en `./_lib/llm/` directamente — no extiendas este file.
 */

export {
  askLLMForJson,
  askLLMForText,
  askLLMForTextStreaming,
  askLLMForVision,
  clearLLMCache,
} from './llm/index.js'
export type {
  LLMMessage,
  LLMOverride,
  LLMProvider,
  LLMResult,
  LLMUsage,
  StreamFrame,
} from './llm/index.js'
