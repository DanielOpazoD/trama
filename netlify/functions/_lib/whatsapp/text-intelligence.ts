import { getSql, sqlTyped } from '../db.js'
import { checkMonthlyBudget } from '../cost-cap.js'
import { resolveAIInvocation } from '../ai-mode.js'
import { askLLMForJson, askLLMForText } from '../llm.js'
import { buildRagContext } from '../rag-context.js'
import { logEvent } from '../observability.js'
import { formatStatus } from './status.js'
import {
  buildRecallPrompt,
  formatRecallAnswer,
  formatRecallFallback,
  recallHasResults,
} from './recall.js'
import { buildClassifyPrompt, validateClassification } from './interpret.js'
import { persistWhatsAppEvent } from './events.js'
import type { CaptureIntent } from './types.js'

/**
 * Inteligencia de texto del webhook de WhatsApp: el comando `estado`, el recall
 * con RAG ("preguntale a tu Trama") y la clasificación de texto libre con LLM.
 * Cada una corre bajo el RLS del dueño y degrada con gracia cuando la IA está off
 * o sin presupuesto (fallback a listado / nota plana).
 */

/**
 * Comando `estado`: lee el vínculo + un conteo de mensajes de este mes y arma
 * el resumen (formato puro en status.ts). Corre bajo el RLS del dueño.
 */
export async function buildStatusReply(
  sql: ReturnType<typeof getSql>,
  userId: string,
  phone: string,
): Promise<string> {
  const linkRows = await sqlTyped<{
    verified_at: string | null
    label: string | null
    last_capture_kind: string | null
    last_capture_at: string | null
  }>(sql`
    SELECT verified_at, label, last_capture_kind, last_capture_at
    FROM whatsapp_links
    WHERE phone_e164 = ${phone} AND user_id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `)
  const countRows = await sqlTyped<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM whatsapp_processed_messages
    WHERE user_id = ${userId} AND created_at >= date_trunc('month', NOW())
  `)
  const link = linkRows[0]
  return formatStatus({
    verifiedAt: link?.verified_at ?? null,
    deviceLabel: link?.label ?? null,
    lastCaptureKind: link?.last_capture_kind ?? null,
    lastCaptureAt: link?.last_capture_at ?? null,
    monthCount: countRows[0]?.n ?? 0,
  })
}

/**
 * Recall ("preguntale a tu Trama"): arma contexto con RAG (entidades + citas +
 * relaciones) y compone una respuesta anclada en lo que el usuario ya guardó.
 * Si la IA está off / sin presupuesto / falla, cae a un listado con deep links.
 * Corre bajo el RLS del dueño.
 */
export async function handleQuery(
  req: Request,
  sql: ReturnType<typeof getSql>,
  userId: string,
  requestId: string,
  query: string,
  origin: string,
): Promise<string> {
  const overBudget = await checkMonthlyBudget(userId, requestId)
  const invocation = overBudget
    ? ({ kind: 'off' } as const)
    : await resolveAIInvocation(req, 'chat', userId)
  const aiOn = invocation.kind === 'ready'

  // HyDE solo si vamos a usar IA igual (sino agrega latencia/costo sin sentido).
  const ctx = await buildRagContext(sql, query, userId, {
    hyde: aiOn,
    requestId,
  })
  if (!recallHasResults(ctx)) {
    return 'Todavía no encontré nada sobre eso. Prueba con otras palabras o guarda algo nuevo y vuelve a preguntar.'
  }
  if (!aiOn) return formatRecallFallback(ctx, origin)
  try {
    const { content } = await askLLMForText(buildRecallPrompt(query, ctx), {
      provider: invocation.provider,
      model: invocation.model,
    })
    // askLLMForText tipa `content` como unknown (shape compartido con el modo
    // JSON); en modo texto es string. Si no lo es, caemos al listado.
    const answer = typeof content === 'string' ? content.trim() : ''
    if (!answer) return formatRecallFallback(ctx, origin)
    logEvent({ event: 'whatsapp_recall', usedRag: ctx.usedRag, usedHyde: ctx.usedHyde })
    // El evento de observabilidad NO debe degradar una respuesta ya lograda: si
    // este INSERT falla, igual devolvemos el answer (sin caer al fallback del
    // catch, que es para fallos REALES del recall, no del logging).
    try {
      await persistWhatsAppEvent(sql, userId, { event: 'recall', ok: true })
    } catch {
      // best-effort: el answer ya está listo.
    }
    return formatRecallAnswer(answer, ctx, origin)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    logEvent({ event: 'whatsapp_recall_failed', message: detail })
    await persistWhatsAppEvent(sql, userId, { event: 'recall', ok: false, detail })
    return formatRecallFallback(ctx, origin)
  }
}

/** Texto libre → CaptureIntent vía LLM, con fallback a nota si algo falla. */
export async function classifyFreeform(
  req: Request,
  userId: string,
  text: string,
  requestId: string,
): Promise<CaptureIntent> {
  const fallback: CaptureIntent = { kind: 'note', content: text }
  const overBudget = await checkMonthlyBudget(userId, requestId)
  if (overBudget) return fallback
  const invocation = await resolveAIInvocation(req, 'classify', userId)
  if (invocation.kind === 'off') return fallback
  try {
    const { content, usage, fromCache } = await askLLMForJson(buildClassifyPrompt(text), {
      provider: invocation.provider,
      model: invocation.model,
    })
    const classified = validateClassification(content)
    // Registro en extraction_log para que el cost-cap mensual contabilice el
    // gasto (un cache hit no cobra: cost_cents = 0). Awaited para que quede
    // escrito antes de responder (la instancia se congela tras el return).
    await getSql()`
      INSERT INTO extraction_log (input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms, user_id)
      VALUES (${text}, ${JSON.stringify(classified ?? {})}::jsonb, ${usage.provider}, ${usage.model}, ${usage.tokensIn}, ${usage.tokensOut}, ${fromCache ? 0 : usage.costCents}, ${usage.durationMs}, ${userId})
    `.catch(() => {})
    return classified ?? fallback
  } catch {
    return fallback
  }
}
