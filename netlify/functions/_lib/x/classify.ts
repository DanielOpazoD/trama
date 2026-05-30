/**
 * Clasificación por tema de los bookmarks de X, vía LLM (por lotes).
 *
 * El prompt-builder y el parser son puros (testeables sin red). `runClassify`
 * orquesta: selecciona los sin tema, llama al LLM en lotes, y persiste el tema.
 * Lo usan el endpoint /api/x/classify (on-demand) y /api/x/sync (automático).
 */

import { askLLMForJson, type LLMMessage } from '../llm.js'
import type { SqlClient } from './client.js'

// Taxonomía fija + "Otro". El usuario la puede ampliar editando esta lista.
export const TOPIC_CATEGORIES = [
  'IA',
  'Medicina',
  'Cripto',
  'Tecnología',
  'Ciencia',
  'Finanzas',
  'Política',
  'Cultura',
  'Otro',
] as const
export type Topic = (typeof TOPIC_CATEGORIES)[number]
const TOPIC_SET = new Set<string>(TOPIC_CATEGORIES)

const BATCH_SIZE = 40

/** Prompt de clasificación: un tema de la taxonomía por tweet, salida JSON. */
export function buildClassifyMessages(
  items: ReadonlyArray<{ id: string; text: string }>,
): LLMMessage[] {
  const list = items
    .map((b, i) => `${i + 1}. [id:${b.id}] ${b.text.replace(/\s+/g, ' ').slice(0, 280)}`)
    .join('\n')
  const cats = TOPIC_CATEGORIES.join(', ')
  return [
    {
      role: 'system',
      content:
        'Sos un clasificador de tweets por tema. Para cada tweet asigná EXACTAMENTE ' +
        `una categoría de esta lista: ${cats}. Usá "Otro" solo si ninguna encaja. ` +
        'Respondé SOLO con JSON, sin markdown, con la forma ' +
        '{"classifications":[{"id":"<id>","topic":"<categoría>"}]}.',
    },
    {
      role: 'user',
      content: `Clasificá estos ${items.length} tweets:\n\n${list}`,
    },
  ]
}

/** Extrae el mapa id→tema de la respuesta del LLM (descarta temas inválidos). */
export function parseClassifications(content: unknown): Map<string, Topic> {
  const out = new Map<string, Topic>()
  const arr = (content as { classifications?: Array<{ id?: unknown; topic?: unknown }> })
    ?.classifications
  if (!Array.isArray(arr)) return out
  for (const c of arr) {
    if (
      typeof c?.id === 'string' &&
      typeof c?.topic === 'string' &&
      TOPIC_SET.has(c.topic)
    ) {
      out.set(c.id, c.topic as Topic)
    }
  }
  return out
}

async function selectUnclassified(
  sql: SqlClient,
  userId: string,
  limit: number,
): Promise<Array<{ id: string; text: string }>> {
  const rows = (await sql`
    SELECT id, text FROM x_bookmarks
    WHERE user_id = ${userId} AND deleted_at IS NULL AND topic IS NULL
    ORDER BY captured_at DESC
    LIMIT ${limit}
  `) as Array<{ id: string; text: string }>
  return rows
}

async function countUnclassified(sql: SqlClient, userId: string): Promise<number> {
  const rows = (await sql`
    SELECT COUNT(*)::int AS c FROM x_bookmarks
    WHERE user_id = ${userId} AND deleted_at IS NULL AND topic IS NULL
  `) as Array<{ c: number }>
  return rows[0]?.c ?? 0
}

export type ClassifyInvocation = { provider: string | undefined; model: string | null }
export type ClassifyResult = { classified: number; remaining: boolean }

/**
 * Clasifica hasta `maxBatches` lotes de bookmarks sin tema. Cada lote es una
 * llamada al LLM. Los que el LLM no resuelve quedan como "Otro" (así no se
 * re-piden eternamente). Persiste cada tema y loguea el costo en extraction_log.
 */
export async function runClassify(
  sql: SqlClient,
  userId: string,
  invocation: ClassifyInvocation,
  maxBatches: number,
): Promise<ClassifyResult> {
  let classified = 0
  for (let i = 0; i < maxBatches; i++) {
    const batch = await selectUnclassified(sql, userId, BATCH_SIZE)
    if (batch.length === 0) break

    const { content, usage } = await askLLMForJson(buildClassifyMessages(batch), {
      provider: invocation.provider,
      model: invocation.model,
    })
    const topics = parseClassifications(content)

    for (const b of batch) {
      const topic: Topic = topics.get(b.id) ?? 'Otro'
      await sql`
        UPDATE x_bookmarks SET topic = ${topic}
        WHERE id = ${b.id} AND user_id = ${userId}
      `
      classified += 1
    }

    sql`
      INSERT INTO extraction_log (
        input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms, user_id
      ) VALUES (
        ${'x-classify'},
        ${JSON.stringify({ classified: batch.length })}::jsonb,
        ${usage.provider}, ${usage.model},
        ${usage.tokensIn}, ${usage.tokensOut}, ${usage.costCents}, ${usage.durationMs},
        ${userId}
      )
    `.catch(() => {})
  }

  const remaining = (await countUnclassified(sql, userId)) > 0
  return { classified, remaining }
}
