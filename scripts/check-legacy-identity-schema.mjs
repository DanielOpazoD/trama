#!/usr/bin/env node

/**
 * Contrato de esquema para el cutover legacy-single-user.
 *
 * Corre contra Postgres REAL en el job `migrations`, despues de aplicar todas
 * las migraciones. Complementa `legacy-identity-contracts.mjs`: el contrato
 * estatico verifica que exista una migracion DROP DEFAULT; este check consulta
 * information_schema para probar que la DB migrada quedo sin defaults legacy
 * efectivos.
 */

import pg from 'pg'
import { pathToFileURL } from 'node:url'
import {
  LEGACY_USER_ID,
  validateLegacyIdentityCutoverContracts,
} from './legacy-identity-contracts.mjs'

const DB_URL =
  process.env.DATABASE_URL ||
  process.env.NETLIFY_DB_URL ||
  'postgresql://trama:trama_local_dev@localhost:5433/trama'

function expectedCutoverTables() {
  return validateLegacyIdentityCutoverContracts().legacyDefaultTables
}

export function evaluateLegacyIdentitySchemaRows(rows) {
  const issues = []
  for (const row of rows) {
    const table = row.table_name
    const columnDefault = row.column_default
    const nullable = row.is_nullable
    if (typeof columnDefault === 'string' && columnDefault.includes(LEGACY_USER_ID)) {
      issues.push(`${table}.user_id conserva DEFAULT ${LEGACY_USER_ID}`)
    }
    if (nullable !== 'NO') {
      issues.push(`${table}.user_id debe ser NOT NULL`)
    }
  }
  return { ok: issues.length === 0, issues }
}

export function formatLegacyIdentitySchemaError(err, dbUrl = DB_URL) {
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

  return `Error verificando el esquema legacy identity${code}: ${message}`
}

export async function checkLegacyIdentitySchema(dbUrl = DB_URL) {
  const tables = expectedCutoverTables()
  const client = new pg.Client({ connectionString: dbUrl })
  await client.connect()
  try {
    const { rows } = await client.query(
      `SELECT table_name, column_default, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND column_name = 'user_id'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [tables],
    )
    const seen = new Set(rows.map((row) => row.table_name))
    const missing = tables.filter((table) => !seen.has(table))
    const evaluated = evaluateLegacyIdentitySchemaRows(rows)
    const issues = [
      ...missing.map((table) => `${table}.user_id no existe en schema migrado`),
      ...evaluated.issues,
    ]
    return { ok: issues.length === 0, checkedTables: tables.length, issues }
  } finally {
    await client.end()
  }
}

async function main() {
  try {
    const result = await checkLegacyIdentitySchema()
    if (!result.ok) {
      console.error('Contrato legacy identity roto:')
      for (const issue of result.issues) console.error(`  - ${issue}`)
      console.error(
        '\nlegacy-single-user debe quedar como compatibilidad historica; no como DEFAULT operativo.',
      )
      process.exitCode = 1
      return
    }

    console.log(
      `Contrato legacy identity ok — ${result.checkedTables} columnas user_id sin DEFAULT legacy.`,
    )
  } catch (err) {
    console.error(formatLegacyIdentitySchemaError(err))
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
