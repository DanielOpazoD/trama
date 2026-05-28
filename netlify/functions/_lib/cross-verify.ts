/**
 * Cross-verification: ask a second LLM (different provider) to review a set
 * of proposals from the primary model and mark each item as ✓ agreed or
 * ⚠ doubtful with a short note. Saves the user from having to trust a single
 * model — two different families of model rarely hallucinate the same way.
 *
 * Returns a Map<index, { agreed, note? }> aligned to the input list. If the
 * verifier call fails, returns an empty map — the caller treats that as "no
 * verification available" and proceeds without sealing anything.
 */

import { askLLMForJson, type LLMMessage } from './llm.js'
import type { LLMUsage } from './llm.js'

export type VerifyVerdict = {
  agreed: boolean
  note?: string
}

export type VerificationResult = {
  verdictsByIndex: Map<number, VerifyVerdict>
  usage: LLMUsage | null
  error?: string
}

export type CrossVerifyInput<T> = {
  items: T[]
  describe: (item: T, index: number) => string
  /** What is being verified — used in the system prompt. */
  context: string
  verifierProvider: string
  verifierModel?: string | null
  /** Optional model name being verified (for the verifier to know who it's auditing). */
  primaryProviderName?: string
}

/**
 * Generic cross-verification. The describe() function turns each item into a
 * single-line description ready to drop into a numbered list — keep it short.
 */
export async function crossVerify<T>(
  input: CrossVerifyInput<T>,
): Promise<VerificationResult> {
  if (input.items.length === 0) {
    return { verdictsByIndex: new Map(), usage: null }
  }

  const numberedItems = input.items
    .map((item, i) => `${i + 1}. ${input.describe(item, i)}`)
    .join('\n')

  const system = `Eres un revisor crítico. Otra IA (${
    input.primaryProviderName ?? 'una IA'
  }) acaba de producir esta lista de propuestas para la "Trama" de un usuario — un mapa cognitivo personal de personas, obras, conceptos y sus relaciones.

CONTEXTO: ${input.context}

Tu trabajo: revisar cada item NUMERADO y decir si estás de acuerdo. Sé crítico pero justo:
- Si el item es razonable y bien fundado, devuelve agreed: true. No agregues nota.
- Si tienes dudas (información incorrecta, tipo dudoso, salto especulativo) devuelve agreed: false con una nota CORTA (máximo 15 palabras) explicando la duda.
- Si el item es claramente correcto pero podría refinarse, márcalo agreed: true y NO le pongas nota — el usuario decide si refinar.
- No inventes razones para dudar. Si dudas en menos del 30% de los items, probablemente el modelo primario está bien.

Items a revisar:
${numberedItems}

DEVUELVE EXCLUSIVAMENTE un objeto JSON con esta forma exacta:

{
  "verdicts": [
    { "index": 1, "agreed": true },
    { "index": 2, "agreed": false, "note": "Pink Floyd es banda, no persona" }
  ]
}

- "index" es el número del item (empezando en 1).
- Solo incluye items donde realmente tengas un veredicto. Si omites un item, se asume agreed: true.
- Sin markdown, sin comentarios extra. Solo el JSON.`

  const messages: LLMMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: 'Revisa la lista y devuelve los veredictos.' },
  ]

  try {
    const { content, usage } = await askLLMForJson(messages, {
      provider: input.verifierProvider,
      model: input.verifierModel ?? undefined,
    })
    const parsed = (content ?? {}) as { verdicts?: unknown }
    const verdictsByIndex = new Map<number, VerifyVerdict>()
    if (Array.isArray(parsed.verdicts)) {
      for (const v of parsed.verdicts as Array<Record<string, unknown>>) {
        if (typeof v !== 'object' || v === null) continue
        const idx = typeof v.index === 'number' ? v.index - 1 : null
        if (idx === null || idx < 0 || idx >= input.items.length) continue
        const agreed = v.agreed === true
        const note =
          typeof v.note === 'string' && v.note.trim()
            ? (v.note as string).trim()
            : undefined
        verdictsByIndex.set(idx, { agreed, note })
      }
    }
    return { verdictsByIndex, usage }
  } catch (err) {
    return {
      verdictsByIndex: new Map(),
      usage: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
