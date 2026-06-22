#!/usr/bin/env node

/**
 * Inventario READ-ONLY de huérfanos de storage (ítem E2).
 *
 * Cruza el manifest `storage_assets` contra la existencia real de cada objeto en
 * el store para detectar dos clases de huérfano que NINGÚN gate estático puede
 * ver (necesita DB + store):
 *
 *   (a) manifest sin objeto: fila viva cuyo objeto no está en el store (un
 *       `complete` registrado sin que llegara el PUT, o un borrado parcial);
 *   (b) objeto sin manifest: objeto en el store sin fila (un PUT presignado que
 *       nunca llamó a `complete`).
 *
 * Read-only ABSOLUTO: solo SELECT en DB y HEAD firmado en R2. No hay un solo
 * DELETE/UPDATE/PUT acá, ni debe agregarse — la limpieza correcta es la regla de
 * lifecycle del bucket (ver `docs/storage-orphans.md`), no un endpoint ni este
 * script. La lógica de veredicto vive en el núcleo PURO
 * `netlify/functions/_lib/storage-orphans.ts` (testeado sin DB ni red); acá solo
 * juntamos los datos y delegamos.
 *
 * Conexión a DB: sigue el patrón de los otros scripts operacionales
 * (`storage-assets-report.mjs`, `legacy-data-reassignment-dry-run.mjs`): cliente
 * `pg` efímero contra `DATABASE_URL` / `NETLIFY_DB_URL`. No usa `neon()` ni el
 * `getSql()` del runtime.
 *
 * Existencia en R2: usa `r2ObjectExists` de `netlify/functions/_lib/r2.ts` (HEAD
 * firmado), el MISMO helper que el endpoint de complete, importado vía
 * type-stripping de Node. Requiere las env vars R2_* (las mismas del runtime).
 */

import pg from 'pg'
import { pathToFileURL } from 'node:url'

import {
  classifyStorageOrphans,
  sanitizeStorageKey,
} from '../netlify/functions/_lib/storage-orphans.ts'

export const STORAGE_ORPHANS_MODE = 'dry-run-read-only'

/** Provider que SÍ podemos comprobar read-only objeto por objeto (HEAD firmado). */
export const PROBEABLE_PROVIDER = 'r2'

const DB_URL =
  process.env.DATABASE_URL ||
  process.env.NETLIFY_DB_URL ||
  'postgresql://trama:trama_local_dev@localhost:5433/trama'

/** Tope de objetos a sondear por corrida (cada uno es un HEAD de red). */
const DEFAULT_MAX_PROBES = 500

function nowIso() {
  return new Date().toISOString()
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Trae las filas ACTIVAS (`deleted_at IS NULL`) del manifest para un provider.
 * Solo SELECT. Devuelve `{ provider, domain, storageKey }` (camelCase) listo para
 * el núcleo puro.
 */
export async function fetchManifestRows(client, provider = PROBEABLE_PROVIDER) {
  const { rows } = await client.query(
    `SELECT provider, domain, storage_key
       FROM storage_assets
      WHERE provider = $1
        AND deleted_at IS NULL
      ORDER BY storage_key`,
    [provider],
  )
  return rows.map((r) => ({
    provider: r.provider,
    domain: r.domain,
    storageKey: r.storage_key,
  }))
}

/**
 * Para cada fila del manifest, comprueba si su objeto existe en R2 con un HEAD
 * firmado y devuelve el set de keys presentes + warnings de probing.
 *
 * Read-only: `objectExists` es un HEAD. Se topa en `maxProbes` para no disparar
 * un HEAD por cada objeto en manifests enormes; si se trunca, queda un warning y
 * las filas no sondeadas se omiten del cruce (no se asumen ausentes).
 */
export async function probePresentKeys(
  rows,
  { objectExists, maxProbes = DEFAULT_MAX_PROBES } = {},
) {
  const present = new Set()
  const warnings = []
  const probed = rows.slice(0, maxProbes)
  if (rows.length > probed.length) {
    warnings.push(
      `Se sondearon ${probed.length}/${rows.length} objetos (tope --max-probes); el resto se omitió del cruce.`,
    )
  }

  for (const r of probed) {
    try {
      const { exists } = await objectExists(r.storageKey)
      if (exists) present.add(r.storageKey)
    } catch (err) {
      warnings.push(
        `No se pudo comprobar ${sanitizeStorageKey(r.storageKey)} (${err?.message ?? 'sin detalle'}).`,
      )
    }
  }

  return { present, warnings, probedCount: probed.length }
}

/**
 * Reúne el inventario de un provider sondeable: lee manifest, sondea existencia y
 * clasifica con el núcleo puro. `deps` se inyecta en tests para no tocar DB ni R2.
 *
 * Nota sobre `objectsWithoutManifest`: este camino solo confirma huérfanos
 * (b) si puede ENUMERAR el store. R2 no se lista read-only desde acá (no hay
 * `LIST` firmado en `r2.ts`), así que solo se cubre lo cruzable contra el
 * manifest. Cuando `presentKeys` se arma sondeando filas del manifest, todas las
 * keys presentes tienen fila por construcción y `objectsWithoutManifest` queda
 * vacío — la categoría se documenta pero la detección de (b) recae en la regla de
 * lifecycle del bucket (`docs/storage-orphans.md`). Si en el futuro hay un LIST
 * firmado, alimentar esas keys a `presentKeys` y el núcleo ya las clasifica.
 */
export async function collectProviderInventory({
  provider = PROBEABLE_PROVIDER,
  dbUrl = DB_URL,
  maxProbes = DEFAULT_MAX_PROBES,
  deps,
} = {}) {
  // El sondeo en vivo usa `r2ObjectExists`: solo tiene sentido para R2. Con `deps`
  // inyectadas (tests) el caller provee el `objectExists` que corresponda, así que
  // ahí no forzamos provider. Sin deps (camino real/CLI), un provider != r2 daría
  // un veredicto FALSO (keys cotejadas contra el backend equivocado: todo se vería
  // como "manifest sin objeto") → cortamos con un error claro.
  if (!deps && provider !== PROBEABLE_PROVIDER) {
    throw new Error(
      `Solo se puede sondear el provider '${PROBEABLE_PROVIDER}' en vivo (HEAD firmado a R2); ` +
        `'${provider}' no es comprobable read-only desde acá. La existencia de objetos de otros ` +
        `providers se delega a la regla de lifecycle del bucket (ver docs/storage-orphans.md).`,
    )
  }
  const resolved = deps ?? (await resolveLiveDeps(dbUrl))
  const { client, objectExists, ownsClient } = resolved
  try {
    const manifestRows = await fetchManifestRows(client, provider)
    const { present, warnings, probedCount } = await probePresentKeys(manifestRows, {
      objectExists,
      maxProbes,
    })
    const report = classifyStorageOrphans({
      provider,
      manifestRows,
      presentKeys: present,
    })
    return { provider, probedCount, report, warnings }
  } finally {
    if (ownsClient && client?.end) await client.end()
  }
}

/**
 * Resuelve dependencias vivas (cliente pg + `r2ObjectExists`). Se separa para que
 * `collectProviderInventory` sea inyectable en tests sin DB ni red.
 */
async function resolveLiveDeps(dbUrl) {
  const { r2ObjectExists, isR2Configured } =
    await import('../netlify/functions/_lib/r2.ts')
  if (!isR2Configured()) {
    throw new Error(
      'R2 no está configurado (faltan R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET).',
    )
  }
  const client = new pg.Client({ connectionString: dbUrl })
  await client.connect()
  return { client, objectExists: r2ObjectExists, ownsClient: true }
}

export function summarizeOrphans(inventory, { generatedAt = nowIso() } = {}) {
  const { report } = inventory
  return {
    generatedAt,
    mode: STORAGE_ORPHANS_MODE,
    provider: inventory.provider,
    writesPerformed: false,
    probedObjects: inventory.probedCount,
    counts: report.counts,
    manifestWithoutObject: report.manifestWithoutObject,
    objectsWithoutManifest: report.objectsWithoutManifest,
    warnings: inventory.warnings,
    nonGoals: [
      'no delete object',
      'no update manifest',
      'no put object',
      'no list mutation',
    ],
  }
}

export function formatOrphansMarkdown(summary) {
  const lines = [
    '# Storage Orphans Inventory',
    '',
    `- Generado: ${summary.generatedAt}`,
    `- Modo: \`${summary.mode}\``,
    `- Provider: \`${summary.provider}\``,
    `- Escrituras realizadas: **${summary.writesPerformed ? 'si' : 'no'}**`,
    `- Objetos sondeados: ${summary.probedObjects}`,
    '',
    '## Resumen',
    '',
    `- Filas de manifest cruzadas: ${summary.counts.manifestRows}`,
    `- Objetos presentes confirmados: ${summary.counts.presentKeys}`,
    `- Manifest sin objeto (a): ${summary.counts.manifestWithoutObject}`,
    `- Objeto sin manifest (b): ${summary.counts.objectsWithoutManifest}`,
    `- Sanos (ok): ${summary.counts.ok}`,
    '',
    '## Manifest sin objeto (revisar y soft-deletear por el camino de dominio)',
    '',
    '| Provider | Dominio | Key sanitizada |',
    '| --- | --- | --- |',
  ]
  if (summary.manifestWithoutObject.length === 0) {
    lines.push('| _ninguno_ | | |')
  } else {
    for (const item of summary.manifestWithoutObject) {
      lines.push(`| ${item.provider} | ${item.domain} | \`${item.sanitizedKey}\` |`)
    }
  }

  lines.push(
    '',
    '## Objeto sin manifest (lo limpia la regla de lifecycle del bucket)',
    '',
    '| Provider | Dominio | Key sanitizada |',
    '| --- | --- | --- |',
  )
  if (summary.objectsWithoutManifest.length === 0) {
    lines.push('| _ninguno (ver nota de enumeración en docs/storage-orphans.md)_ | | |')
  } else {
    for (const item of summary.objectsWithoutManifest) {
      lines.push(`| ${item.provider} | ${item.domain} | \`${item.sanitizedKey}\` |`)
    }
  }

  lines.push('', '## Warnings', '')
  if (summary.warnings.length === 0) lines.push('- Sin warnings.')
  else for (const warning of summary.warnings) lines.push(`- ${warning}`)

  lines.push('', '## Non-goals (este script es read-only)', '')
  for (const nonGoal of summary.nonGoals) lines.push(`- ${nonGoal}`)

  return `${lines.join('\n')}\n`
}

export function formatOrphansJson(summary) {
  return `${JSON.stringify(summary, null, 2)}\n`
}

export function parseArgs(argv) {
  const options = {
    json: false,
    markdown: false,
    provider: PROBEABLE_PROVIDER,
    maxProbes: DEFAULT_MAX_PROBES,
  }
  for (const arg of argv) {
    if (arg === '--json') options.json = true
    else if (arg === '--markdown') options.markdown = true
    else if (arg.startsWith('--provider=')) {
      options.provider = arg.slice('--provider='.length) || PROBEABLE_PROVIDER
    } else if (arg.startsWith('--max-probes=')) {
      options.maxProbes = Math.max(0, asNumber(arg.split('=')[1], DEFAULT_MAX_PROBES))
    } else {
      throw new Error(`Argumento no reconocido: ${arg}`)
    }
  }
  if (!options.json && !options.markdown) options.markdown = true
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const inventory = await collectProviderInventory({
    provider: options.provider,
    maxProbes: options.maxProbes,
  })
  const summary = summarizeOrphans(inventory)
  if (options.json) process.stdout.write(formatOrphansJson(summary))
  if (options.markdown) console.log(formatOrphansMarkdown(summary))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main()
  } catch (err) {
    const code = err?.code ? ` (${err.code})` : ''
    const message =
      err?.message && String(err.message).trim().length > 0
        ? String(err.message).trim()
        : 'sin detalle'
    console.error(
      `No pude generar el inventario de huérfanos de storage${code}: ${message}`,
    )
    console.error(
      'Necesita DATABASE_URL / NETLIFY_DB_URL y las env vars R2_* (las mismas del runtime).',
    )
    process.exitCode = 1
  }
}
