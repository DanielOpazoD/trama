import pg from 'pg'
import { fileURLToPath } from 'node:url'

const DEFAULT_DB_URL = 'postgresql://trama:trama_local_dev@localhost:5433/trama'
const DB_URL = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL || DEFAULT_DB_URL
const FIXTURE_USER_ID = 'query-plan-it-user'
const FIXTURE_SIZE = Number.parseInt(process.env.QUERY_PLAN_FIXTURE_SIZE ?? '1500', 10)
const MAX_SEQ_SCAN_ROWS = Number.parseInt(
  process.env.QUERY_PLAN_MAX_SEQ_SCAN_ROWS ?? '100',
  10,
)

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
    if (node['Node Type'] !== 'Seq Scan') return false
    const relation = node['Relation Name'] ?? '(unknown)'
    if (allowed.has(relation)) return false
    return Number(node['Plan Rows'] ?? 0) > maxRows
  })

  if (offenders.length > 0) {
    const details = offenders
      .map((node) => {
        const relation = node['Relation Name'] ?? '(unknown)'
        const rows = node['Plan Rows'] ?? '?'
        return `Seq Scan on ${relation} (plan rows: ${rows})`
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
  for (const table of ['notes', 'recortes', 'momentos', 'quotes', 'entities']) {
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
  await pool.query('ANALYZE entities')
  await pool.query('ANALYZE quotes')
  await pool.query('ANALYZE recortes')
  await pool.query('ANALYZE momentos')
  await pool.query('ANALYZE notes')
}

async function explain(pool, label, text, values = [], opts = {}) {
  const result = await pool.query(`EXPLAIN (FORMAT JSON) ${text}`, values)
  const plan = result.rows[0]['QUERY PLAN']
  assertNoLargeSeqScans(label, plan, opts)
  return plan
}

export async function runQueryPlanCheck({ dbUrl = DB_URL } = {}) {
  const pool = new pg.Pool({ connectionString: dbUrl })
  try {
    await setupFixtures(pool)
    const checks = [
      [
        'entities.paginated',
        `SELECT id FROM entities
         WHERE deleted_at IS NULL AND user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 50`,
        [FIXTURE_USER_ID],
      ],
      [
        'quotes.paginated',
        `SELECT id FROM quotes
         WHERE deleted_at IS NULL AND user_id = $1
         ORDER BY pinned_at DESC NULLS LAST, created_at DESC, id DESC
         LIMIT 50`,
        [FIXTURE_USER_ID],
      ],
      [
        'recortes.feed',
        `SELECT id FROM recortes
         WHERE deleted_at IS NULL AND user_id = $1 AND status = 'pending'
         ORDER BY created_at DESC, id DESC
         LIMIT 50`,
        [FIXTURE_USER_ID],
      ],
      [
        'momentos.kind-feed',
        `SELECT id FROM momentos
         WHERE deleted_at IS NULL AND user_id = $1 AND kind = 'nota'
         ORDER BY captured_at DESC, id DESC
         LIMIT 50`,
        [FIXTURE_USER_ID],
      ],
      [
        'notes.feed',
        `SELECT id FROM notes
         WHERE deleted_at IS NULL AND user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 50`,
        [FIXTURE_USER_ID],
      ],
      [
        'search.entities.lexical',
        `SELECT id FROM entities
         WHERE deleted_at IS NULL AND user_id = $1
           AND search_vector @@ websearch_to_tsquery('simple', $2)
         ORDER BY ts_rank(search_vector, websearch_to_tsquery('simple', $2)) DESC
         LIMIT 50`,
        [FIXTURE_USER_ID, 'query plan hot'],
      ],
      [
        'search.quotes.lexical',
        `SELECT q.id FROM quotes q
         JOIN entities e ON e.id = q.entity_id
          AND e.deleted_at IS NULL
          AND e.user_id = $1
         WHERE q.deleted_at IS NULL AND q.user_id = $1
           AND q.search_vector @@ websearch_to_tsquery('simple', $2)
         ORDER BY ts_rank(q.search_vector, websearch_to_tsquery('simple', $2)) DESC
         LIMIT 50`,
        [FIXTURE_USER_ID, 'query plan hot'],
      ],
      [
        'search.momentos.lexical',
        `SELECT id FROM momentos
         WHERE deleted_at IS NULL AND user_id = $1
           AND search_vector @@ websearch_to_tsquery('simple', $2)
         ORDER BY ts_rank(search_vector, websearch_to_tsquery('simple', $2)) DESC
         LIMIT 50`,
        [FIXTURE_USER_ID, 'query plan hot'],
      ],
    ]

    for (const [label, text, values] of checks) {
      await explain(pool, label, text, values)
      console.log(`query-plan OK: ${label}`)
    }
  } finally {
    await pool.end()
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  runQueryPlanCheck().catch((err) => {
    const message = err instanceof Error && err.message ? err.message : String(err)
    console.error(`check:query-plans failed for ${DB_URL}: ${message}`)
    process.exitCode = 1
  })
}
