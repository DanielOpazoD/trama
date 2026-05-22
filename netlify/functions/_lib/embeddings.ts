/**
 * Dense vector embeddings for semantic search + dup detection.
 *
 * One provider for now (OpenAI's `text-embedding-3-small` — 1536 dims, $0.02
 * per million tokens, the cheapest decent embedding model). The interface
 * keeps room to swap providers without touching call sites.
 *
 * Failures are non-fatal: callers should keep working without an embedding
 * (the row is still saved, search just won't find it semantically until
 * a future re-index). That keeps create/update flows resilient.
 */

const OPENAI_EMBED_MODEL = 'text-embedding-3-small'
const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings'
export const EMBED_DIMS = 1536

export type EmbedResult = {
  vector: number[]
  model: string
}

function readEmbeddingsKey(): string {
  // Reuse the same key the main OpenAI provider uses (OPENAI_API_KEY first,
  // AI_API_KEY as a legacy fallback). No separate config — embeddings are
  // cheap and tied to the same account anyway.
  const explicit = Netlify.env.get('OPENAI_API_KEY')
  if (explicit) return explicit
  const fallback = Netlify.env.get('AI_API_KEY')
  if (fallback) return fallback
  throw new Error(
    'Embeddings requieren OPENAI_API_KEY (o AI_API_KEY como fallback).',
  )
}

/**
 * Embed a single text. Returns the vector and the model id used. Throws on
 * HTTP failures so the caller can decide whether to swallow or surface.
 */
export async function embed(text: string): Promise<EmbedResult> {
  const cleaned = text.trim().slice(0, 8000) // OpenAI hard cap, plus we don't need more for our short blobs.
  if (!cleaned) {
    throw new Error('Texto vacío: no se puede generar embedding.')
  }
  const key = readEmbeddingsKey()
  const res = await fetch(OPENAI_EMBED_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: OPENAI_EMBED_MODEL,
      input: cleaned,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Embeddings API error ${res.status}: ${body.slice(0, 200)}`,
    )
  }
  type EmbedRes = { data: Array<{ embedding: number[] }>; model: string }
  const json = (await res.json()) as EmbedRes
  const vector = json.data?.[0]?.embedding
  if (!Array.isArray(vector) || vector.length !== EMBED_DIMS) {
    throw new Error('Embeddings API devolvió un vector con dimensiones inesperadas.')
  }
  return { vector, model: json.model ?? OPENAI_EMBED_MODEL }
}

/**
 * Best-effort: returns the embedding result, or null if anything goes wrong.
 * Use this on create/update paths so a transient embedding failure doesn't
 * break the user's write.
 */
export async function embedSafe(text: string): Promise<EmbedResult | null> {
  try {
    return await embed(text)
  } catch (err) {
    console.warn('embedSafe failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Format a number[] into the literal Postgres vector input format,
 * "[0.01,0.02,...]". Used because postgres-js sends arrays as ARRAY[..]
 * by default, which pgvector doesn't accept directly.
 */
export function toPgVector(v: number[]): string {
  return '[' + v.join(',') + ']'
}

/**
 * Build a stable "what to embed" string for an entity. We combine the name,
 * type, year, and description so semantic search can match either the name
 * or the description ("ensayista argentino del siglo XX" → Borges).
 */
export function entityEmbeddingText(input: {
  name: string
  type: string
  year?: number | null
  description?: string | null
}): string {
  const parts = [
    input.name,
    `tipo: ${input.type}`,
    input.year ? `año: ${input.year}` : '',
    input.description ? `descripción: ${input.description}` : '',
  ].filter(Boolean)
  return parts.join('. ')
}

/**
 * Embed text for a quote. We include the attribution and source for context —
 * the model should index the cite together with its context (who said it,
 * where it appears) instead of just the raw words.
 */
export function quoteEmbeddingText(input: {
  text: string
  entityName?: string | null
  source?: string | null
  context?: string | null
}): string {
  const parts = [
    input.text,
    input.entityName ? `de: ${input.entityName}` : '',
    input.source ? `fuente: ${input.source}` : '',
    input.context ? `contexto: ${input.context}` : '',
  ].filter(Boolean)
  return parts.join('. ')
}
