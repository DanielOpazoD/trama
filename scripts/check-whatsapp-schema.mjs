#!/usr/bin/env node

/**
 * Contrato de esquema del puente WhatsApp ↔ Trama, validado contra una base
 * Postgres REAL (no mocks). Corre en el job `migrations` de CI, después de
 * aplicar todas las migraciones, y localmente con `npm run db:up` levantado.
 *
 * Por qué existe: los tests del webhook mockean SQL, así que NUNCA ven si una
 * columna que el código referencia falta en el esquema. Eso ya rompió
 * producción una vez (la columna `whatsapp_links.label` se usaba en el endpoint
 * pero ninguna migración la creaba → 500 al generar el código de vínculo, PR
 * #208). Este check convierte esa clase entera de bug en un fallo de CI barato:
 * lista cada columna que el código de WhatsApp toca y verifica que exista.
 *
 * Si agregás una columna nueva al flujo de WhatsApp, sumala acá Y creá su
 * migración — el check te obliga a no olvidarte de la segunda.
 */

import pg from 'pg'
import { pathToFileURL } from 'node:url'

// Mismo default que scripts/apply-migrations.sh (docker-compose: host 5433).
const DB_URL =
  process.env.DATABASE_URL ||
  process.env.NETLIFY_DB_URL ||
  'postgresql://trama:trama_local_dev@localhost:5433/trama'

/**
 * Columnas que el código del webhook/persist referencia, por tabla. Mantener
 * en sync con netlify/functions/_lib/whatsapp/* y whatsapp-webhook.mts.
 */
const REQUIRED = {
  whatsapp_links: [
    'id',
    'phone_e164',
    'user_id',
    'verified_at',
    'deleted_at',
    'link_code',
    'link_code_expires_at',
    'label',
    'last_capture_kind',
    'last_capture_id',
    'last_capture_at',
    'last_message_at',
    'created_at',
    'updated_at',
  ],
  whatsapp_processed_messages: ['message_sid', 'user_id', 'created_at'],
  recortes: [
    'id',
    'text',
    'image_key',
    'capture_mode',
    'status',
    'source',
    'user_id',
    'deleted_at',
  ],
  notes: ['id', 'content', 'title', 'tags', 'pinned', 'source', 'user_id', 'deleted_at'],
  tasks: ['id', 'title', 'detail', 'tags', 'origin', 'user_id', 'deleted_at'],
  // Las notas de voz se guardan como anexo de la nota (re-escuchable).
  notas_attachments: [
    'owner_type',
    'owner_id',
    'file_name',
    'mime_type',
    'byte_size',
    'storage_key',
    'user_id',
    'deleted_at',
  ],
  momentos: ['id', 'kind', 'payload', 'note', 'origin', 'user_id', 'deleted_at'],
  entities: [
    'id',
    'type',
    'name',
    'year',
    'description',
    'origin',
    'user_id',
    'deleted_at',
  ],
  quotes: ['id', 'entity_id', 'text', 'origin', 'user_id', 'deleted_at'],
}

async function actualColumns(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  )
  return new Set(rows.map((r) => r.column_name))
}

export function formatSchemaCheckError(err, dbUrl = DB_URL) {
  const code = err?.code ? ` (${err.code})` : ''
  const message =
    err?.message && String(err.message).trim().length > 0
      ? String(err.message).trim()
      : `sin detalle del driver pg${code}`

  if (
    err?.code === 'ECONNREFUSED' ||
    err?.code === 'ENOTFOUND' ||
    /ECONNREFUSED|ENOTFOUND|connect/i.test(message)
  ) {
    return [
      `No pude conectar a Postgres${code}: ${message}`,
      `DB usada: ${dbUrl}`,
      'Para correr este contrato localmente, levanta la base con `npm run db:up` o define `DATABASE_URL` / `NETLIFY_DB_URL` apuntando a una DB migrada.',
    ].join('\n')
  }

  return `Error verificando el esquema${code}: ${message}`
}

export async function checkWhatsAppSchema(dbUrl = DB_URL) {
  const client = new pg.Client({ connectionString: dbUrl })
  await client.connect()
  try {
    const problems = []

    for (const [table, columns] of Object.entries(REQUIRED)) {
      const present = await actualColumns(client, table)
      if (present.size === 0) {
        problems.push(`tabla faltante: ${table}`)
        continue
      }
      const missing = columns.filter((c) => !present.has(c))
      if (missing.length > 0) {
        problems.push(`${table}: faltan columnas → ${missing.join(', ')}`)
      }
    }

    // El shape de `origin` es parser-sensible (AGENTS.md). No basta con que la
    // columna exista: una migración que la cambie de jsonb a text rompería los
    // parsers en runtime sin que este check lo note. Validamos el tipo.
    for (const table of ['entities', 'momentos', 'quotes', 'tasks']) {
      const { rows } = await client.query(
        `SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'origin'`,
        [table],
      )
      const dataType = rows[0]?.data_type
      if (dataType && dataType !== 'jsonb') {
        problems.push(`${table}.origin: tipo ${dataType} (esperado jsonb)`)
      }
    }

    if (problems.length > 0) return { ok: false, problems }

    const total = Object.values(REQUIRED).reduce((n, c) => n + c.length, 0)
    return { ok: true, total, tables: Object.keys(REQUIRED).length }
  } finally {
    await client.end()
  }
}

async function main() {
  try {
    const result = await checkWhatsAppSchema()
    if (!result.ok) {
      console.error('❌ Contrato de esquema WhatsApp roto:')
      for (const p of result.problems) console.error(`   - ${p}`)
      console.error(
        '\nEl código de WhatsApp referencia columnas que no existen en la DB migrada.',
      )
      console.error(
        'Creá la migración faltante (esto es exactamente el bug del PR #208).',
      )
      process.exitCode = 1
      return
    }

    console.log(
      `✅ Contrato de esquema WhatsApp ok — ${result.total} columnas en ${result.tables} tablas.`,
    )
  } catch (err) {
    console.error(formatSchemaCheckError(err))
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
