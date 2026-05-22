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
 *   "forced:<provider>" → every call ignores per-task config and goes to the
 *                         named provider. Useful for A/B comparisons or when
 *                         one provider's key is down.
 *
 * Absent or unknown headers are treated as "auto".
 */

import type { LLMProvider } from './llm.js'
import { resolveTaskProvider, type AITask } from './ai-tasks.js'

export type AIMode =
  | { kind: 'off' }
  | { kind: 'auto' }
  | { kind: 'forced'; provider: LLMProvider }

const VALID_PROVIDERS: ReadonlySet<LLMProvider> = new Set<LLMProvider>([
  'deepseek',
  'openai',
  'anthropic',
  'gemini',
])

export function parseAIMode(raw: string | null | undefined): AIMode {
  if (!raw) return { kind: 'auto' }
  const value = raw.trim().toLowerCase()
  if (value === 'off') return { kind: 'off' }
  if (value === 'auto') return { kind: 'auto' }
  const match = /^forced:([a-z]+)$/.exec(value)
  if (match && VALID_PROVIDERS.has(match[1] as LLMProvider)) {
    return { kind: 'forced', provider: match[1] as LLMProvider }
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
 * should bail out with aiOffResponse().
 */
export async function resolveAIInvocation(
  req: Request,
  task: AITask,
): Promise<Invocation> {
  const mode = readAIMode(req)
  if (mode.kind === 'off') return { kind: 'off' }
  if (mode.kind === 'forced') {
    return { kind: 'ready', provider: mode.provider, model: null, verifyWith: null }
  }
  const cfg = await resolveTaskProvider(task)
  return {
    kind: 'ready',
    provider: cfg.provider || undefined,
    model: cfg.model,
    verifyWith: cfg.verifyWith,
  }
}

/** 423 Locked — clear semantics for "the resource exists but is currently disabled". */
export function aiOffResponse(): Response {
  return new Response('IA deshabilitada por el usuario (modo Off).', { status: 423 })
}
