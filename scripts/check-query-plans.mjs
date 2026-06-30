import pg from 'pg'
import { fileURLToPath, URL } from 'node:url'

const DEFAULT_DB_URL = 'postgresql://trama:trama_local_dev@localhost:5433/trama'
const DB_CONFIG = resolveQueryPlanDbConfig(process.env)
const FIXTURE_USER_ID = 'query-plan-it-user'
const FIXTURE_SIZE = readEnvInteger('QUERY_PLAN_FIXTURE_SIZE', 1500, { min: 1 })
const MAX_SEQ_SCAN_ROWS = readEnvInteger('QUERY_PLAN_MAX_SEQ_SCAN_ROWS', 100, {
  min: 0,
})

export const EXPECTED_QUERY_PLAN_DOMAINS = [
  'entities',
  'quotes',
  'recortes',
  'momentos',
  'notes',
  'search',
]

export const QUERY_PLAN_FIXTURES = [
  { domain: 'entities', table: 'entities' },
  { domain: 'quotes', table: 'quotes' },
  { domain: 'recortes', table: 'recortes' },
  { domain: 'momentos', table: 'momentos' },
  { domain: 'notes', table: 'notes' },
]

const SEARCH_TERM = 'query plan hot'
const SEARCH_LIKE = `%${SEARCH_TERM}%`

export const QUERY_PLAN_CHECKS = [
  {
    label: 'entities.paginated',
    domain: 'entities',
    text: `SELECT id FROM entities
     WHERE deleted_at IS NULL AND user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    values: ({ userId }) => [userId],
  },
  {
    label: 'quotes.paginated',
    domain: 'quotes',
    text: `SELECT id FROM quotes
     WHERE deleted_at IS NULL AND user_id = $1
     ORDER BY pinned_at DESC NULLS LAST, created_at DESC, id DESC
     LIMIT 50`,
    values: ({ userId }) => [userId],
  },
  {
    label: 'recortes.feed',
    domain: 'recortes',
    text: `SELECT id FROM recortes
     WHERE deleted_at IS NULL AND user_id = $1 AND status = 'pending'
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    values: ({ userId }) => [userId],
  },
  {
    label: 'momentos.kind-feed',
    domain: 'momentos',
    text: `SELECT id FROM momentos
     WHERE deleted_at IS NULL AND user_id = $1 AND kind = 'nota'
     ORDER BY captured_at DESC, id DESC
     LIMIT 50`,
    values: ({ userId }) => [userId],
  },
  {
    label: 'notes.feed',
    domain: 'notes',
    text: `SELECT id FROM notes
     WHERE deleted_at IS NULL AND user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    values: ({ userId }) => [userId],
  },
  {
    label: 'notes.search',
    domain: 'notes',
    text: `SELECT id FROM notes
     WHERE deleted_at IS NULL AND user_id = $1
       AND (content ILIKE $2 OR title ILIKE $2)
     ORDER BY pinned DESC, created_at DESC, id DESC
     LIMIT 50`,
    values: ({ userId, searchLike }) => [userId, searchLike],
  },
  {
    label: 'recortes.objects-search',
    domain: 'recortes',
    text: `SELECT id FROM objects
     WHERE user_id = $1 AND kind = 'recorte'
       AND (body ILIKE $2 OR (title IS NOT NULL AND title ILIKE $2))
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    values: ({ userId, searchLike }) => [userId, searchLike],
  },
  {
    label: 'notes.unified-feed',
    domain: 'notes',
    text: `SELECT id FROM (
       SELECT id, created_at FROM (
         SELECT id, created_at FROM notes
         WHERE deleted_at IS NULL AND user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 50
       ) AS note_page
       UNION ALL
       SELECT id, created_at FROM (
         SELECT id, created_at FROM recortes
         WHERE deleted_at IS NULL AND user_id = $1 AND status <> 'archived'
         ORDER BY created_at DESC, id DESC
         LIMIT 50
       ) AS recorte_page
     ) AS feed_page
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    values: ({ userId }) => [userId],
  },
  {
    label: 'search.entities.lexical',
    domain: 'search',
    text: `SELECT id FROM entities
     WHERE deleted_at IS NULL AND user_id = $1
       AND search_vector @@ websearch_to_tsquery('simple', $2)
     ORDER BY ts_rank(search_vector, websearch_to_tsquery('simple', $2)) DESC
     LIMIT 50`,
    values: ({ userId, searchTerm }) => [userId, searchTerm],
  },
  {
    label: 'search.quotes.lexical',
    domain: 'search',
    text: `SELECT q.id FROM quotes q
     JOIN entities e ON e.id = q.entity_id
      AND e.deleted_at IS NULL
      AND e.user_id = $1
     WHERE q.deleted_at IS NULL AND q.user_id = $1
       AND q.search_vector @@ websearch_to_tsquery('simple', $2)
     ORDER BY ts_rank(q.search_vector, websearch_to_tsquery('simple', $2)) DESC
     LIMIT 50`,
    values: ({ userId, searchTerm }) => [userId, searchTerm],
  },
  {
    label: 'search.momentos.lexical',
    domain: 'search',
    text: `SELECT id FROM momentos
     WHERE deleted_at IS NULL AND user_id = $1
       AND search_vector @@ websearch_to_tsquery('simple', $2)
     ORDER BY ts_rank(search_vector, websearch_to_tsquery('simple', $2)) DESC
     LIMIT 50`,
    values: ({ userId, searchTerm }) => [userId, searchTerm],
  },
]

function readEnvInteger(name, fallback, { min }) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isInteger(value) || value < min || String(value) !== raw.trim()) {
    throw new Error(
      `${name} must be an integer >= ${min}; received ${JSON.stringify(raw)}`,
    )
  }
  return value
}

export function resolveQueryPlanDbConfig(env = process.env) {
  if (env.DATABASE_URL) return { dbUrl: env.DATABASE_URL, source: 'DATABASE_URL' }
  if (env.NETLIFY_DB_URL) return { dbUrl: env.NETLIFY_DB_URL, source: 'NETLIFY_DB_URL' }
  return { dbUrl: DEFAULT_DB_URL, source: 'default local Postgres' }
}

export function sanitizeDbUrlForLog(dbUrl) {
  try {
    const parsed = new URL(dbUrl)
    parsed.username = ''
    parsed.password = ''
    return parsed.toString()
  } catch {
    return '[unparseable database URL]'
  }
}

function connectionRefused(error) {
  if (!error || typeof error !== 'object') return false
  if (error.code === 'ECONNREFUSED') return true
  if (Array.isArray(error.errors)) return error.errors.some(connectionRefused)
  return false
}

function missingMigratedSchema(error) {
  if (!error || typeof error !== 'object') return false
  if (error.code === '42P01' || error.code === '42703' || error.code === '42883') {
    return true
  }
  if (Array.isArray(error.errors)) return error.errors.some(missingMigratedSchema)
  const message = error instanceof Error ? error.message : String(error)
  return /relation ".+" does not exist|column ".+" does not exist|function .+ does not exist/i.test(
    message,
  )
}

function localDbRunbookLines() {
  return [
    'Runbook local recomendado:',
    '  1. `npm run db:up` para levantar Postgres y aplicar migraciones.',
    '  2. Si la DB quedo vieja o inconsistente, `npm run db:reset`.',
    '  3. `npm run check:query-plans` o `npm run local:db-confidence`.',
    '',
    'Tambien puedes definir DATABASE_URL o NETLIFY_DB_URL apuntando a una Postgres migrada.',
  ]
}

export function formatQueryPlanCheckFailure({ dbUrl, error }) {
  const safeDbUrl = sanitizeDbUrlForLog(dbUrl)
  if (connectionRefused(error)) {
    return [
      `check:query-plans no pudo conectar a Postgres (${safeDbUrl}).`,
      '',
      ...localDbRunbookLines(),
    ].join('\n')
  }

  if (missingMigratedSchema(error)) {
    return [
      `check:query-plans encontro una DB sin schema migrado (${safeDbUrl}).`,
      '',
      'Aplica migraciones con `scripts/apply-migrations.sh` o recrea la DB local con `npm run db:reset`.',
      'Este check necesita las tablas, indices y columnas actuales de main antes de sembrar fixtures.',
      '',
      ...localDbRunbookLines(),
    ].join('\n')
  }

  const message = error instanceof Error && error.message ? error.message : String(error)
  return `check:query-plans failed for ${safeDbUrl}: ${message}`
}

export async function setQueryPlanRlsContext(client, userId = FIXTURE_USER_ID) {
  await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId])
}

export function collectPlanNodes(explainJson) {
  const root = Array.isArray(explainJson) ? explainJson[0]?.Plan : explainJson?.Plan
  const nodes = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    nodes.push(node)
    for (const child of node.Plans ?? []) visit(child)
  }
  visit(root)
  return nodes
}

export function assertNoLargeSeqScans(label, explainJson, opts = {}) {
  const allowed = new Set(opts.allowedRelations ?? [])
  const maxRows = opts.maxSeqScanRows ?? MAX_SEQ_SCAN_ROWS
  const offenders = collectPlanNodes(explainJson).filter((node) => {
    const nodeType = node['Node Type']
    if (nodeType !== 'Seq Scan' && nodeType !== 'Parallel Seq Scan') return false
    const relation = node['Relation Name'] ?? '(unknown)'
    if (allowed.has(relation)) return false
    return Number(node['Plan Rows'] ?? 0) > maxRows
  })

  if (offenders.length > 0) {
    const details = offenders
      .map((node) => {
        const relation = node['Relation Name'] ?? '(unknown)'
        const rows = node['Plan Rows'] ?? '?'
        return `${node['Node Type']} on ${relation} (plan rows: ${rows})`
      })
      .join('; ')
    throw new Error(`${label}: ${details}`)
  }
}

async function setupFixtures(pool) {
  await pool.query(
    `INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
    [FIXTURE_USER_ID, `${FIXTURE_USER_ID}@example.test`],
  )
  for (const table of [...QUERY_PLAN_FIXTURES]
    .reverse()
    .map((fixture) => fixture.table)) {
    await pool.query(
      `UPDATE ${table} SET deleted_at = NOW()
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [FIXTURE_USER_ID],
    )
  }

  await pool.query(
    `INSERT INTO entities (user_id, type, name, description, origin, created_at)
     SELECT $1, 'query-plan-entity', 'query plan entity ' || gs,
            CASE WHEN gs % 1000 = 0
              THEN 'query plan fixture hot searchable ' || gs
              ELSE 'query plan fixture cold searchable ' || gs
            END,
            '{"kind":"manual"}'::jsonb,
            NOW() - (gs || ' seconds')::interval
     FROM generate_series(1, $2::int) AS gs`,
    [FIXTURE_USER_ID, FIXTURE_SIZE],
  )
  await pool.query(
    `INSERT INTO quotes (user_id, entity_id, text, source, origin, created_at)
     SELECT $1, fixture.id,
            CASE WHEN fixture.rn % 1000 = 0
              THEN 'query plan quote hot searchable ' || fixture.rn
              ELSE 'query plan quote cold searchable ' || fixture.rn
            END,
            'query-plan', '{"kind":"manual"}'::jsonb,
            NOW() - (fixture.rn || ' seconds')::interval
     FROM (
       SELECT e.id, row_number() OVER (ORDER BY e.created_at DESC) AS rn
       FROM entities e
       WHERE e.user_id = $1 AND e.deleted_at IS NULL
       ORDER BY e.created_at DESC
       LIMIT $2::int
     ) AS fixture`,
    [FIXTURE_USER_ID, FIXTURE_SIZE],
  )
  await pool.query(
    `INSERT INTO recortes (user_id, text, status, created_at)
     SELECT $1, 'query plan recorte hot searchable ' || gs, 'pending',
            NOW() - (gs || ' seconds')::interval
     FROM generate_series(1, $2::int) AS gs`,
    [FIXTURE_USER_ID, FIXTURE_SIZE],
  )
  await pool.query(
    `INSERT INTO momentos (user_id, kind, payload, origin, captured_at, created_at)
     SELECT $1, 'nota',
            jsonb_build_object(
              'bodyText',
              CASE WHEN gs % 1000 = 0
                THEN 'query plan momento hot searchable ' || gs
                ELSE 'query plan momento cold searchable ' || gs
              END
            ),
            '{"kind":"manual"}'::jsonb,
            NOW() - (gs || ' seconds')::interval,
            NOW() - (gs || ' seconds')::interval
     FROM generate_series(1, $2::int) AS gs`,
    [FIXTURE_USER_ID, FIXTURE_SIZE],
  )
  await pool.query(
    `INSERT INTO notes (user_id, content, title, tags, pinned, created_at)
     SELECT $1, 'query plan note hot searchable ' || gs, 'query plan note ' || gs,
            ARRAY['query-plan'], false,
            NOW() - (gs || ' seconds')::interval
     FROM generate_series(1, $2::int) AS gs`,
    [FIXTURE_USER_ID, FIXTURE_SIZE],
  )
  for (const { table } of QUERY_PLAN_FIXTURES) {
    await pool.query(`ANALYZE ${table}`)
  }
}

async function explain(pool, label, text, values = [], opts = {}) {
  const result = await pool.query(`EXPLAIN (FORMAT JSON) ${text}`, values)
  const plan = result.rows[0]['QUERY PLAN']
  assertNoLargeSeqScans(label, plan, opts)
  return plan
}

export async function runQueryPlanCheck({
  dbUrl = DB_CONFIG.dbUrl,
  stdout = console.log,
} = {}) {
  const pool = new pg.Pool({ connectionString: dbUrl })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await setQueryPlanRlsContext(client)
    await setupFixtures(client)
    let checked = 0
    const context = {
      userId: FIXTURE_USER_ID,
      searchTerm: SEARCH_TERM,
      searchLike: SEARCH_LIKE,
    }
    for (const check of QUERY_PLAN_CHECKS) {
      const values = check.values(context)
      await explain(client, check.label, check.text, values, check.opts)
      checked += 1
      stdout(`query-plan OK: ${check.label}`)
    }
    stdout(`query-plan OK: ${checked}/${QUERY_PLAN_CHECKS.length} checks`)
    await client.query('ROLLBACK')
    return { checked }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  runQueryPlanCheck().catch((err) => {
    console.error(formatQueryPlanCheckFailure({ dbUrl: DB_CONFIG.dbUrl, error: err }))
    process.exitCode = 1
  })
}
