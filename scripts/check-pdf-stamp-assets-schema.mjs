#!/usr/bin/env node

/**
 * Contrato real de DB para la biblioteca de firmas/timbres PDF.
 *
 * Valida contra Postgres migrado que las constraints aceptan el mismo formato
 * de data URL que el endpoint parsea: MIME case-insensitive y separador `;` o
 * `,`. Los tests unitarios ven SQL mockeado; este check ve constraints reales.
 */

import pg from 'pg'
import { pathToFileURL } from 'node:url'

const DB_URL =
  process.env.DATABASE_URL ||
  process.env.NETLIFY_DB_URL ||
  'postgresql://trama:trama_local_dev@localhost:5433/trama'

const USER_ID = 'pdf-stamp-assets-schema-it'

const CASES = [
  {
    id: 'png-semicolon',
    mimeType: 'image/png',
    src: 'DATA:IMAGE/PNG;base64,a',
  },
  {
    id: 'png-comma',
    mimeType: 'image/png',
    src: 'data:image/png,a',
  },
  {
    id: 'jpeg-semicolon',
    mimeType: 'image/jpeg',
    src: 'DATA:IMAGE/JPEG;base64,a',
  },
  {
    id: 'jpeg-comma',
    mimeType: 'image/jpeg',
    src: 'data:image/jpeg,a',
  },
]

export function formatPdfStampAssetsSchemaError(err, dbUrl = DB_URL) {
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

  return `Error verificando pdf_stamp_assets${code}: ${message}`
}

export async function checkPdfStampAssetsSchema(dbUrl = DB_URL) {
  const client = new pg.Client({ connectionString: dbUrl })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(`INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [
      USER_ID,
    ])
    await client.query(
      `UPDATE pdf_stamp_assets
       SET deleted_at = NOW()
       WHERE user_id = $1 AND id = ANY($2::text[]) AND deleted_at IS NULL`,
      [USER_ID, CASES.map((item) => item.id)],
    )

    for (const item of CASES) {
      await client.query(
        `INSERT INTO pdf_stamp_assets (
          id, user_id, kind, name, src, mime_type, width, height, byte_size
        )
        VALUES ($1, $2, 'signature', $3, $4, $5, 1, 1, $6)`,
        [item.id, USER_ID, item.id, item.src, item.mimeType, item.src.length],
      )
    }

    await client.query('ROLLBACK')
    return { ok: true, accepted: CASES.length }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    await client.end()
  }
}

async function main() {
  try {
    const result = await checkPdfStampAssetsSchema()
    console.log(
      `pdf_stamp_assets schema ok — ${result.accepted} data URL variants accepted.`,
    )
  } catch (err) {
    console.error(formatPdfStampAssetsSchemaError(err))
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
