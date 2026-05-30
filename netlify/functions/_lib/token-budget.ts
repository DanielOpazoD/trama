import { logEvent } from './observability.js'

/**
 * Acotado del CONTEXTO dinámico que se inyecta en los prompts de ask/chat.
 *
 * Antes los prompts cortaban con `.slice(0, 80)` ciego (o sin cortar): a
 * escala, una entidad con descripción larga inflaba el prompt sin control y el
 * provider podía truncar EN SILENCIO al exceder su ventana de contexto. Acá
 * acotamos por TOKENS estimados y, si dejamos algo afuera, lo logueamos.
 */

/** Presupuesto total de tokens para el contexto (entidades + relaciones +
 *  citas). ~6000 deja amplio margen en modelos de 32k-128k de contexto. */
export const DEFAULT_CONTEXT_TOKEN_BUDGET = 6000

/** Estimación barata: ~4 chars/token (mezcla es/en). No exacta, pero
 *  suficiente para acotar el contexto sin tokenizar de verdad. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Incluye items hasta agotar `maxTokens`. Siempre devuelve al menos uno (si hay)
 * para no quedarse sin contexto. Devuelve los incluidos + cuántos se omitieron.
 */
export function budgetItems<T>(
  items: readonly T[],
  toText: (item: T) => string,
  maxTokens: number,
): { items: T[]; dropped: number; usedTokens: number } {
  const out: T[] = []
  let used = 0
  for (const item of items) {
    const cost = estimateTokens(toText(item))
    if (out.length > 0 && used + cost > maxTokens) break
    out.push(item)
    used += cost
  }
  return { items: out, dropped: items.length - out.length, usedTokens: used }
}

/**
 * Loguea un `context_truncated` si se omitió algo — para que el truncamiento sea
 * VISIBLE en los logs (y no una sorpresa silenciosa del lado del provider).
 */
export function logContextTruncation(
  source: 'ask' | 'chat',
  drops: { entities: number; relationships: number; quotes: number },
  budgetTokens: number,
): void {
  const total = drops.entities + drops.relationships + drops.quotes
  if (total === 0) return
  logEvent({
    event: 'context_truncated',
    source,
    entitiesDropped: drops.entities,
    relationshipsDropped: drops.relationships,
    quotesDropped: drops.quotes,
    budgetTokens,
  })
}
