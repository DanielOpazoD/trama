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

// ---------- Query embedding cache ----------
// Las queries de búsqueda y de chat-RAG embeben texto del usuario. La
// misma pregunta repetida (refresh, ida-y-vuelta entre vistas) genera el
// mismo vector — pero hoy cada llamada paga OpenAI. Un cache en memoria
// con TTL corto evita ese gasto en el caso común.
//
// Per-function-instance only. En Netlify cada cold start lo limpia, pero
// dentro de un instance caliente la misma query es free. Para algo más
// agresivo (cross-instance) habría que usar Netlify Blobs.

type CacheEntry = { value: EmbedResult; expiresAt: number }
const embedCache = new Map<string, CacheEntry>()
const EMBED_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutos
const EMBED_CACHE_MAX = 500

function cacheKey(text: string): string {
  // Lower-case + collapse whitespace: "Borges" y "borges " son la misma
  // query semántica.
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

function getCachedEmbedding(text: string): EmbedResult | null {
  const key = cacheKey(text)
  const entry = embedCache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    embedCache.delete(key)
    return null
  }
  return entry.value
}

function setCachedEmbedding(text: string, value: EmbedResult): void {
  const key = cacheKey(text)
  embedCache.set(key, { value, expiresAt: Date.now() + EMBED_CACHE_TTL_MS })
  // Cheap LRU-ish trim.
  if (embedCache.size > EMBED_CACHE_MAX) {
    const oldest = embedCache.keys().next().value
    if (oldest) embedCache.delete(oldest)
  }
}

/** Clear the embedding cache. Useful in tests. */
export function clearEmbeddingCache(): void {
  embedCache.clear()
}

/**
 * Embed a single text. Returns the vector and the model id used. Throws on
 * HTTP failures so the caller can decide whether to swallow or surface.
 *
 * Cachea por texto normalizado (lower + collapse whitespace) por 10 min.
 * Pasar `{ noCache: true }` para forzar refresh.
 *
 * Para escrituras (POST/PATCH) usar `embedSafe()` en lugar de éste —
 * un fallo de embedding NO debe romper el flujo de guardado.
 *
 * @example
 *   const { vector, model } = await embed('Borges, escritor argentino')
 *   await sql`UPDATE entities SET embedding = ${toPgVector(vector)}::vector,
 *                                  embedding_model = ${model}
 *             WHERE id = ${id}`
 */
export async function embed(
  text: string,
  options?: { noCache?: boolean },
): Promise<EmbedResult> {
  const cleaned = text.trim().slice(0, 8000) // OpenAI hard cap, plus we don't need more for our short blobs.
  if (!cleaned) {
    throw new Error('Texto vacío: no se puede generar embedding.')
  }
  if (!options?.noCache) {
    const cached = getCachedEmbedding(cleaned)
    if (cached) return cached
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
  const result: EmbedResult = { vector, model: json.model ?? OPENAI_EMBED_MODEL }
  setCachedEmbedding(cleaned, result)
  return result
}

/**
 * Best-effort: returns the embedding result, or null if anything goes wrong.
 * Use this on create/update paths so a transient embedding failure doesn't
 * break the user's write.
 *
 * Errores comunes que silencia:
 *   - Sin `OPENAI_API_KEY` configurada
 *   - Rate limit del provider
 *   - Network failure / DNS
 *   - Texto vacío (después de trim)
 *
 * @example
 *   const emb = await embedSafe(quoteEmbeddingText({ text, entityName }))
 *   // emb puede ser null — el INSERT debe manejar ambos casos
 *   await sql`INSERT INTO quotes (…, embedding, embedding_model)
 *             VALUES (…,
 *               ${emb ? toPgVector(emb.vector) : null}::vector,
 *               ${emb?.model ?? null})`
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
 *
 * @example
 *   sql`UPDATE entities SET embedding = ${toPgVector(emb.vector)}::vector
 *       WHERE id = ${id}`
 *   // ↑ "::vector" cast obligatorio
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
