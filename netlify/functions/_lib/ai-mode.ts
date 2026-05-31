/**
 * Global AI-mode toggle.
 *
 * The client sends an `X-AI-Mode` header on every request that hits an AI
 * endpoint. Three states:
 *
 *   "off"               → all AI calls are refused with HTTP 423. Useful for
 *                         a "no quiero gastar hoy" mode, or while reviewing
 *                         manual edits without IA noise.
 *   "auto"              → default. Each task uses its per-task provider config
 *                         (the historical behavior).
 *   "forced:<provider>"          → every call ignores per-task config and goes
 *                                  to the named provider (its default model).
 *   "forced:<provider>:<model>"  → además fuerza un modelo específico de ese
 *                                  provider (e.g. "forced:openai:gpt-5.4").
 *                         Útil para A/B, o cuando la key de un provider está
 *                         caída, o para probar un modelo puntual sin tocar la
 *                         config por-tarea.
 *
 * Absent or unknown headers are treated as "auto".
 */

import type { LLMProvider } from './llm.js'
import { resolveTaskProvider, type AITask } from './ai-tasks.js'
import { ApiErrors } from './api-error.js'

export type AIMode =
  | { kind: 'off' }
  | { kind: 'auto' }
  | { kind: 'forced'; provider: LLMProvider; model: string | null }

const VALID_PROVIDERS: ReadonlySet<LLMProvider> = new Set<LLMProvider>([
  'deepseek',
  'openai',
  'anthropic',
  'gemini',
])

export function parseAIMode(raw: string | null | undefined): AIMode {
  if (!raw) return { kind: 'auto' }
  const trimmed = raw.trim()
  const lower = trimmed.toLowerCase()
  if (lower === 'off') return { kind: 'off' }
  if (lower === 'auto') return { kind: 'auto' }
  // forced:<provider>           → provider con su modelo default
  // forced:<provider>:<model>   → provider + modelo específico (gpt-5.4, etc.)
  // El provider se normaliza a minúsculas; el modelo se conserva tal cual
  // (los ids ya son lowercase, pero no lo asumimos).
  const match = /^forced:([a-z]+)(?::(.*))?$/i.exec(trimmed)
  if (match) {
    const provider = match[1]!.toLowerCase() as LLMProvider
    if (VALID_PROVIDERS.has(provider)) {
      const model = match[2]?.trim()
      return { kind: 'forced', provider, model: model && model.length > 0 ? model : null }
    }
  }
  return { kind: 'auto' }
}

export function readAIMode(req: Request): AIMode {
  return parseAIMode(req.headers.get('x-ai-mode'))
}

export type ReadyInvocation = {
  kind: 'ready'
  /** undefined = use the env default (AI_PROVIDER) */
  provider: string | undefined
  /** null = use the provider's default model */
  model: string | null
  /** Cross-verification provider, or null. Disabled in forced mode. */
  verifyWith: string | null
}

export type Invocation = { kind: 'off' } | ReadyInvocation

/**
 * Resolve provider + model + verifier for a task, honoring the X-AI-Mode header.
 * Returns { kind: 'off' } if the user has globally disabled AI; the endpoint
 * should bail out with aiOffResponse(requestId).
 *
 * `userId` busca la config del usuario en `ai_task_providers (user_id, task)`.
 * Debe venir siempre desde getAuthedUser(); no hay fallback implícito acá
 * porque ocultaría callsites nuevos sin scope multi-user explícito.
 */
export async function resolveAIInvocation(
  req: Request,
  task: AITask,
  userId: string,
): Promise<Invocation> {
  const mode = readAIMode(req)
  if (mode.kind === 'off') return { kind: 'off' }
  if (mode.kind === 'forced') {
    // mode.model = null → el provider usa su modelo default (PROVIDER_DEFAULTS).
    return { kind: 'ready', provider: mode.provider, model: mode.model, verifyWith: null }
  }
  const cfg = await resolveTaskProvider(task, userId)
  return {
    kind: 'ready',
    provider: cfg.provider || undefined,
    model: cfg.model,
    verifyWith: cfg.verifyWith,
  }
}

/** 423 Locked — clear semantics for "the resource exists but is currently disabled". */
export function aiOffResponse(requestId = 'legacy-request'): Response {
  return ApiErrors.aiDisabled(requestId, 'IA deshabilitada por el usuario (modo Off).')
}
