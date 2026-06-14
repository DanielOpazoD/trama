import { sqlTyped, type SqlClient } from '../db.js'
import { parseTags } from '../note-tags.js'
import {
  embedSafe,
  entityEmbeddingText,
  quoteEmbeddingText,
  toPgVector,
} from '../embeddings.js'
import { momentoEmbedText } from '../momento-embed.js'
import type { CaptureIntent } from './types.js'

/**
 * Escribe una CaptureIntent en su dominio reusando los mismos helpers que los
 * endpoints CRUD (tags, embeddings). Asume que el contexto RLS ya apunta al
 * usuario dueño (el webhook llama setCurrentRlsUser antes). Devuelve el texto
 * de confirmación que se le contesta al usuario por WhatsApp.
 *
 * No reimplementa la lógica de negocio fina (dup-detection de entidades,
 * re-embed condicional): es un camino de CAPTURA rápida. Lo que crea queda
 * idéntico en shape a lo que crearían los endpoints, y se cura después desde
 * la app.
 */
export async function persistCapture(
  sql: SqlClient,
  userId: string,
  intent: CaptureIntent,
): Promise<string> {
  switch (intent.kind) {
    case 'note':
      return persistNote(sql, userId, intent.content)
    case 'momento':
      return persistMomento(sql, userId, intent.bodyText)
    case 'entity':
      return persistEntity(
        sql,
        userId,
        intent.name,
        intent.entityType,
        intent.description,
      )
    case 'quote':
      return persistQuote(sql, userId, intent.text, intent.author)
  }
}

async function persistNote(
  sql: SqlClient,
  userId: string,
  content: string,
): Promise<string> {
  const tags = parseTags(content)
  await sql`
    INSERT INTO notes (content, title, tags, pinned, user_id)
    VALUES (${content}, ${null}, ${tags}::text[], ${false}, ${userId})
  `
  return '📝 Nota guardada en Trama.'
}

async function persistMomento(
  sql: SqlClient,
  userId: string,
  bodyText: string,
): Promise<string> {
  const payload = { bodyText }
  const embedSource = momentoEmbedText('nota', payload, null)
  const emb = embedSource.length > 0 ? await embedSafe(embedSource) : null
  await sql`
    INSERT INTO momentos (
      kind, captured_at, payload, note, origin,
      embedding, embedding_model, embedding_at, user_id
    ) VALUES (
      'nota',
      NOW(),
      ${JSON.stringify(payload)}::jsonb,
      ${null},
      ${JSON.stringify({ kind: 'manual' })}::jsonb,
      ${emb ? toPgVector(emb.vector) : null}::vector,
      ${emb?.model ?? null},
      ${emb ? new Date().toISOString() : null}::timestamptz,
      ${userId}
    )
  `
  return '🕰️ Momento guardado en tu línea de tiempo.'
}

async function persistEntity(
  sql: SqlClient,
  userId: string,
  name: string,
  entityType: string,
  description: string | null,
): Promise<string> {
  const emb = await embedSafe(
    entityEmbeddingText({ name, type: entityType, year: null, description }),
  )
  await sql`
    INSERT INTO entities (
      type, name, year, description, origin,
      embedding, embedding_model, embedding_at, user_id
    ) VALUES (
      ${entityType},
      ${name},
      ${null},
      ${description},
      ${JSON.stringify({ kind: 'manual' })}::jsonb,
      ${emb ? toPgVector(emb.vector) : null}::vector,
      ${emb?.model ?? null},
      ${emb ? new Date().toISOString() : null}::timestamptz,
      ${userId}
    )
  `
  return `🔭 Entidad «${name}» agregada al grafo.`
}

async function persistQuote(
  sql: SqlClient,
  userId: string,
  text: string,
  author: string,
): Promise<string> {
  // Una cita necesita una entidad (la del autor). Calculamos los embeddings en
  // JS y resolvemos find-or-create + INSERT de la cita en UN SOLO CTE atómico
  // (regla de dominios.md: multi-write → un WITH). Match por nombre exacto o,
  // si hay embedding, por vecindad vectorial (mismo umbral 0.20 que
  // entities.mts) para no duplicar "Borges" por variantes de tipeo.
  //
  // NOTA: este CTE usa `::vector`, así que no se replica en
  // scripts/check-cte-regression.sql (ese harness es sin pgvector a
  // propósito). Queda cubierto por whatsapp-persist.test.ts (SQL mockeado).
  const origin = JSON.stringify({ kind: 'manual' })
  const entEmb = await embedSafe(
    entityEmbeddingText({ name: author, type: 'persona', year: null, description: null }),
  )
  const quoteEmb = await embedSafe(
    quoteEmbeddingText({ text, entityName: author, source: null, context: null }),
  )
  const entVec = entEmb ? toPgVector(entEmb.vector) : null
  const quoteVec = quoteEmb ? toPgVector(quoteEmb.vector) : null
  const now = new Date().toISOString()

  const rows = await sqlTyped<{ entity_id: string }>(sql`
    WITH existing AS (
      SELECT id FROM entities
      WHERE deleted_at IS NULL AND user_id = ${userId}
        AND (
          lower(name) = lower(${author})
          OR (
            ${entVec}::vector IS NOT NULL
            AND embedding IS NOT NULL
            AND embedding <=> ${entVec}::vector < 0.20
          )
        )
      ORDER BY (lower(name) = lower(${author})) DESC, created_at ASC
      LIMIT 1
    ),
    new_entity AS (
      INSERT INTO entities (
        type, name, origin, embedding, embedding_model, embedding_at, user_id
      )
      SELECT
        'persona', ${author}, ${origin}::jsonb,
        ${entVec}::vector, ${entEmb?.model ?? null}, ${entEmb ? now : null}::timestamptz,
        ${userId}
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      RETURNING id
    ),
    target AS (
      SELECT id FROM existing
      UNION ALL
      SELECT id FROM new_entity
    )
    INSERT INTO quotes (
      entity_id, text, origin, embedding, embedding_model, embedding_at, user_id
    )
    SELECT
      id, ${text}, ${origin}::jsonb,
      ${quoteVec}::vector, ${quoteEmb?.model ?? null}, ${quoteEmb ? now : null}::timestamptz,
      ${userId}
    FROM target
    RETURNING entity_id
  `)
  if (rows.length === 0) {
    return 'No pude guardar la cita. Probá de nuevo.'
  }
  return `❝ Cita de ${author} guardada.`
}
