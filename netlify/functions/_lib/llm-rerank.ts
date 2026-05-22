/**
 * LLM-as-reranker.
 *
 * Cómo funciona: pasamos al LLM una query + N candidatos cortos, y le
 * pedimos que devuelva los IDs ordenados de más a menos relevante. El
 * LLM actúa como cross-encoder informal — no es tan preciso como un
 * modelo dedicado (Cohere Rerank, BGE-reranker) pero NO requiere
 * dependencias nuevas: reusa la key que el usuario ya configuró.
 *
 * Costo aprox: ~1000 tokens input + 300 output por llamada. DeepSeek
 * sale ~$0.0006/rerank. Despreciable a uso personal.
 *
 * Latencia: 1-2s. Por eso solo se usa cuando la calidad importa más
 * que la velocidad — chat RAG sí, sidebar search NO.
 *
 * Degradación graceful: si el LLM falla, devuelve null y el caller
 * usa el orden original.
 */

import { askLLMForJson, type LLMOverride } from './llm.js'

export type RerankCandidate = {
  id: string
  /** Texto corto que describe el candidato. ~50-200 chars idealmente. */
  text: string
}

/**
 * Reordena los candidatos por relevancia para la query usando el LLM
 * configurado. Devuelve los IDs ordenados, o null si algo falla.
 */
export async function llmRerank(
  query: string,
  candidates: RerankCandidate[],
  options?: {
    override?: LLMOverride
    /** Cuántos candidatos pasarle al modelo. Default: todos. Más bajo
        = más rápido, más barato, pero ofrece menos margen de mejora. */
    consider?: number
  },
): Promise<string[] | null> {
  if (candidates.length === 0) return []
  if (candidates.length === 1) return [candidates[0].id]

  const slice = options?.consider
    ? candidates.slice(0, options.consider)
    : candidates

  // Etiquetamos cada candidato con un índice numérico además del UUID, para
  // que el LLM tenga una etiqueta corta a la cual referirse. Vuelve más
  // robusta la salida cuando el modelo "olvida" un UUID.
  const candidateBlock = slice
    .map((c, i) => `[${i + 1}] id=${c.id}\n${c.text}`)
    .join('\n\n')

  const prompt = `Tu tarea: reordenar candidatos por relevancia para una consulta.

CONSULTA DEL USUARIO:
"${query}"

CANDIDATOS:

${candidateBlock}

INSTRUCCIONES:
- Decide qué tan relevante es cada candidato para la consulta.
- Considera el significado, no solo coincidencia de palabras.
- Si la consulta es vaga, prioriza candidatos con más contexto.

DEVUELVE JSON ESTRICTO con esta forma:
{
  "ranking": ["uuid-del-más-relevante", "uuid-del-segundo", ...]
}

Incluye TODOS los ids exactamente como aparecen arriba, en orden de
relevancia decreciente. Sin comentarios, sin texto extra.`

  try {
    const { content } = await askLLMForJson(
      [{ role: 'user', content: prompt }],
      options?.override,
    )
    const raw = content as { ranking?: unknown } | null
    if (!raw || !Array.isArray(raw.ranking)) return null

    const validIds = new Set(slice.map((c) => c.id))
    const reranked = raw.ranking.filter(
      (id): id is string => typeof id === 'string' && validIds.has(id),
    )

    // El LLM podría omitir algunos ids. Pegamos los faltantes al final
    // en su orden original, así no perdemos candidatos por una respuesta
    // parcial.
    const seen = new Set(reranked)
    for (const c of slice) {
      if (!seen.has(c.id)) reranked.push(c.id)
    }

    return reranked
  } catch {
    return null
  }
}

/**
 * Helper: describe una entidad para el reranker. Mantiene el texto corto
 * y bien estructurado para que el LLM lo lea rápido.
 */
export function describeEntity(e: {
  name: string
  type: string
  year?: number | null
  description?: string | null
}): string {
  const meta = [e.type, e.year ?? null].filter(Boolean).join(', ')
  const desc = e.description ? ` — ${e.description}` : ''
  return `"${e.name}" [${meta}]${desc}`
}

/**
 * Helper: describe una cita para el reranker.
 */
export function describeQuote(q: {
  text: string
  entityName?: string | null
  source?: string | null
}): string {
  const attribution = q.entityName ? `de ${q.entityName}` : '(sin atribuir)'
  const src = q.source ? ` [${q.source}]` : ''
  // Limita la cita a 200 chars para que el prompt no se infle.
  const text = q.text.length > 200 ? q.text.slice(0, 197) + '…' : q.text
  return `${attribution}${src}: «${text}»`
}
