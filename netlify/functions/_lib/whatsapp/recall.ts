import type { LLMMessage } from '../llm.js'
import type { RagContext } from '../rag-context.js'
import { captureDeepLink } from './deep-link.js'

/**
 * Recall conversacional: "preguntale a tu Trama" desde WhatsApp. El webhook
 * arma el contexto con `buildRagContext` (entidades + citas + relaciones del
 * usuario, retrieval semántico) y:
 *  - si hay IA disponible, compone una respuesta breve con `askLLMForText`
 *    usando SOLO ese contexto (sin alucinar), y le anexa deep links.
 *  - si la IA está off / sin presupuesto / falla, cae a un listado de los
 *    mejores resultados con deep links (sin LLM).
 *
 * Todo lo de acá es puro y testeable; la llamada al modelo vive en el webhook.
 */

/** Recorta un texto largo para el contexto / el reply. */
function truncate(s: string, max: number): string {
  const t = s.trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** ¿El contexto trae algo accionable? */
export function recallHasResults(ctx: RagContext): boolean {
  return ctx.entities.length > 0 || ctx.quotes.length > 0
}

/** Prompt para componer una respuesta anclada SOLO en el contexto del usuario. */
export function buildRecallPrompt(query: string, ctx: RagContext): LLMMessage[] {
  const entities = ctx.entities
    .slice(0, 12)
    .map((e) => {
      const meta = [e.type, e.year].filter(Boolean).join(', ')
      const desc = e.description ? ` — ${truncate(e.description, 200)}` : ''
      return `- ${e.name}${meta ? ` (${meta})` : ''}${desc}`
    })
    .join('\n')
  const quotes = ctx.quotes
    .slice(0, 12)
    .map((q) => `- "${truncate(q.text, 240)}" — ${q.entity_name}`)
    .join('\n')
  const rels = ctx.relationships
    .slice(0, 20)
    .map((r) => `- ${r.from_name} ${r.type} ${r.to_name}`)
    .join('\n')

  const context = [
    entities && `ENTIDADES:\n${entities}`,
    quotes && `CITAS:\n${quotes}`,
    rels && `RELACIONES:\n${rels}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  return [
    {
      role: 'system',
      content: [
        'Sos el asistente de "Trama", el segundo cerebro del usuario.',
        'Respondé la pregunta usando SOLO el contexto provisto (lo que el usuario ya guardó).',
        'No inventes datos que no estén en el contexto. Si el contexto no alcanza, decilo brevemente.',
        'Respuesta concisa (máx ~60 palabras), en español, tono cercano. Sin markdown ni viñetas.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Pregunta: ${query}\n\nContexto:\n${context || '(sin resultados)'}`,
    },
  ]
}

/** Respuesta compuesta por el LLM + un par de deep links a lo más relevante. */
export function formatRecallAnswer(
  answer: string,
  ctx: RagContext,
  origin: string,
): string {
  const lines = [`🔎 ${answer.trim()}`]
  const links = topLinks(ctx, origin)
  if (links.length > 0) lines.push('', ...links)
  return lines.join('\n')
}

/** Sin LLM: listado de los mejores resultados con sus deep links. */
export function formatRecallFallback(ctx: RagContext, origin: string): string {
  const lines = ['🔎 Esto encontré en tu Trama:']
  for (const e of ctx.entities.slice(0, 3)) {
    lines.push(`• ${e.name}${e.type ? ` (${e.type})` : ''}`)
  }
  for (const q of ctx.quotes.slice(0, 3)) {
    lines.push(`• "${truncate(q.text, 120)}" — ${q.entity_name}`)
  }
  const links = topLinks(ctx, origin)
  if (links.length > 0) lines.push('', ...links)
  return lines.join('\n')
}

/** Deep links a las vistas relevantes según qué trajo el contexto. */
function topLinks(ctx: RagContext, origin: string): string[] {
  const out: string[] = []
  if (ctx.entities.length > 0) out.push(`🔗 ${captureDeepLink(origin, 'entity')}`)
  if (ctx.quotes.length > 0) out.push(`🔗 ${captureDeepLink(origin, 'quote')}`)
  return out
}
