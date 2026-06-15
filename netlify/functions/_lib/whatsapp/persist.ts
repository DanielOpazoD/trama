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
 * Resultado de una captura: el texto de confirmación que se contesta por
 * WhatsApp + el id de la fila creada (o null si no se creó nada). El webhook
 * usa el id para el deep link y para recordar la "última captura" (deshacer).
 */
export type CaptureResult = { message: string; id: string | null }

/**
 * Marcador de procedencia para todo lo capturado vía WhatsApp. Se escribe en
 * la columna `origin` (jsonb) de momentos/entidades/citas; las notas y recortes
 * usan su propia columna `source = 'whatsapp'`. La UI lee `importedFrom` para
 * pintar el iconito de "vino desde WhatsApp". Centralizado acá para no
 * desincronizar la forma del objeto entre los distintos INSERT.
 */
export const WHATSAPP_ORIGIN = JSON.stringify({
  kind: 'manual',
  importedFrom: 'whatsapp',
})

/**
 * Escribe una CaptureIntent en su dominio reusando los mismos helpers que los
 * endpoints CRUD (tags, embeddings). Asume que el contexto RLS ya apunta al
 * usuario dueño (el webhook llama setCurrentRlsUser antes).
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
): Promise<CaptureResult> {
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
    case 'task':
      return persistTask(sql, userId, intent.title, intent.detail)
  }
}

async function persistTask(
  sql: SqlClient,
  userId: string,
  title: string,
  detail: string | null,
): Promise<CaptureResult> {
  const tags = parseTags(`${title}\n${detail ?? ''}`)
  // Las demás columnas (priority/week_start/category/done) usan sus defaults de
  // la tabla: prioridad media, semana actual, categoría trabajo, sin hacer.
  const rows = await sqlTyped<{ id: string }>(sql`
    INSERT INTO tasks (title, detail, tags, origin, user_id)
    VALUES (${title}, ${detail}, ${tags}::text[], ${WHATSAPP_ORIGIN}::jsonb, ${userId})
    RETURNING id
  `)
  return { message: '✅ Tarea añadida a tus pendientes.', id: rows[0]?.id ?? null }
}

async function persistNote(
  sql: SqlClient,
  userId: string,
  content: string,
): Promise<CaptureResult> {
  const tags = parseTags(content)
  const rows = await sqlTyped<{ id: string }>(sql`
    INSERT INTO notes (content, title, tags, pinned, source, user_id)
    VALUES (${content}, ${null}, ${tags}::text[], ${false}, 'whatsapp', ${userId})
    RETURNING id
  `)
  return { message: '📝 Nota guardada en Trama.', id: rows[0]?.id ?? null }
}

async function persistMomento(
  sql: SqlClient,
  userId: string,
  bodyText: string,
): Promise<CaptureResult> {
  const payload = { bodyText }
  const embedSource = momentoEmbedText('nota', payload, null)
  const emb = embedSource.length > 0 ? await embedSafe(embedSource) : null
  const rows = await sqlTyped<{ id: string }>(sql`
    INSERT INTO momentos (
      kind, captured_at, payload, note, origin,
      embedding, embedding_model, embedding_at, user_id
    ) VALUES (
      'nota',
      NOW(),
      ${JSON.stringify(payload)}::jsonb,
      ${null},
      ${WHATSAPP_ORIGIN}::jsonb,
      ${emb ? toPgVector(emb.vector) : null}::vector,
      ${emb?.model ?? null},
      ${emb ? new Date().toISOString() : null}::timestamptz,
      ${userId}
    )
    RETURNING id
  `)
  return {
    message: '🕰️ Momento añadido a tu línea de tiempo.',
    id: rows[0]?.id ?? null,
  }
}

async function persistEntity(
  sql: SqlClient,
  userId: string,
  name: string,
  entityType: string,
  description: string | null,
): Promise<CaptureResult> {
  const emb = await embedSafe(
    entityEmbeddingText({ name, type: entityType, year: null, description }),
  )
  const rows = await sqlTyped<{ id: string }>(sql`
    INSERT INTO entities (
      type, name, year, description, origin,
      embedding, embedding_model, embedding_at, user_id
    ) VALUES (
      ${entityType},
      ${name},
      ${null},
      ${description},
      ${WHATSAPP_ORIGIN}::jsonb,
      ${emb ? toPgVector(emb.vector) : null}::vector,
      ${emb?.model ?? null},
      ${emb ? new Date().toISOString() : null}::timestamptz,
      ${userId}
    )
    RETURNING id
  `)
  return { message: `🔭 «${name}» ya forma parte de tu grafo.`, id: rows[0]?.id ?? null }
}

async function persistQuote(
  sql: SqlClient,
  userId: string,
  text: string,
  author: string,
): Promise<CaptureResult> {
  // Una cita necesita una entidad (la del autor). Calculamos los embeddings en
  // JS y resolvemos find-or-create + INSERT de la cita en UN SOLO CTE atómico
  // (regla de dominios.md: multi-write → un WITH). Match por nombre exacto o,
  // si hay embedding, por vecindad vectorial (mismo umbral 0.20 que
  // entities.mts) para no duplicar "Borges" por variantes de tipeo.
  //
  // NOTA: este CTE usa `::vector`, así que no se replica en
  // scripts/check-cte-regression.sql (ese harness es sin pgvector a
  // propósito). Queda cubierto por whatsapp-persist.test.ts (SQL mockeado).
  const origin = WHATSAPP_ORIGIN
  const entEmb = await embedSafe(
    entityEmbeddingText({ name: author, type: 'persona', year: null, description: null }),
  )
  const quoteEmb = await embedSafe(
    quoteEmbeddingText({ text, entityName: author, source: null, context: null }),
  )
  const entVec = entEmb ? toPgVector(entEmb.vector) : null
  const quoteVec = quoteEmb ? toPgVector(quoteEmb.vector) : null
  const now = new Date().toISOString()

  const rows = await sqlTyped<{ id: string }>(sql`
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
    RETURNING id
  `)
  if (rows.length === 0) {
    return { message: 'No pude guardar la cita. Vuelve a intentarlo.', id: null }
  }
  return { message: `❝ Guardé la cita de ${author}.`, id: rows[0]!.id }
}
