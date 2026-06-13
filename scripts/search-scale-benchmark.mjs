#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const DEFAULT_DB_URL = 'postgresql://trama:trama_local_dev@localhost:5433/trama'
const DB_URL = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL || DEFAULT_DB_URL
const BENCHMARK_USER_ID = 'trama-benchmark-search'
const KEEP_FIXTURES = process.env.SEARCH_BENCHMARK_KEEP_FIXTURES === '1'
const QUERY = process.env.SEARCH_BENCHMARK_QUERY || 'oraculo benchmark 4242'
const RAW_SIZES = process.env.SEARCH_BENCHMARK_SIZES || '10000,50000'

function parseSizes(raw) {
  const sizes = raw
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (sizes.length === 0) {
    throw new Error('SEARCH_BENCHMARK_SIZES debe incluir enteros positivos.')
  }
  return sizes
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function buildBenchmarkSql({ sizes, query, keepFixtures }) {
  const targetRuns = sizes
    .map(
      (size) => `
\\echo ''
\\echo '== search benchmark: ${size} entities + ${size} quotes =='

DELETE FROM quotes WHERE user_id = ${sqlString(BENCHMARK_USER_ID)};
DELETE FROM entities WHERE user_id = ${sqlString(BENCHMARK_USER_ID)};

INSERT INTO entities (user_id, type, name, description, origin)
SELECT
  ${sqlString(BENCHMARK_USER_ID)},
  'concepto',
  'trama-benchmark-search entity ' || gs::text,
  CASE
    WHEN gs % 1000 = 0 THEN ${sqlString(query)} || ' synthetic match ' || gs::text
    ELSE 'synthetic benchmark filler ' || gs::text
  END,
  '{"kind":"manual"}'::jsonb
FROM generate_series(1, ${size}) AS gs;

INSERT INTO quotes (user_id, entity_id, text, source, context, origin)
SELECT
  ${sqlString(BENCHMARK_USER_ID)},
  e.id,
  CASE
    WHEN row_number() OVER (ORDER BY e.created_at, e.id) % 1000 = 0
      THEN ${sqlString(query)} || ' quote synthetic match'
    ELSE 'quote benchmark filler ' || e.name
  END,
  'benchmark',
  'search-scale-benchmark',
  '{"kind":"manual"}'::jsonb
FROM entities e
WHERE e.user_id = ${sqlString(BENCHMARK_USER_ID)}
  AND e.deleted_at IS NULL;

ANALYZE entities;
ANALYZE quotes;

\\echo '-- entities lexical query --'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT e.id, e.name, e.type, e.description, e.year,
       ts_rank(e.search_vector, websearch_to_tsquery('simple', ${sqlString(query)}))
         + similarity(e.name, ${sqlString(query)}) * 0.5 AS rank
FROM entities e
WHERE e.deleted_at IS NULL
  AND e.user_id = ${sqlString(BENCHMARK_USER_ID)}
  AND (e.search_vector @@ websearch_to_tsquery('simple', ${sqlString(query)})
       OR e.name % ${sqlString(query)})
ORDER BY rank DESC
LIMIT 30;

\\echo '-- quotes lexical query --'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT q.id, q.entity_id, e.name AS entity_name, q.text, q.source,
       ts_rank(q.search_vector, websearch_to_tsquery('simple', ${sqlString(query)})) AS rank
FROM quotes q
JOIN entities e ON e.id = q.entity_id
  AND e.deleted_at IS NULL
  AND e.user_id = ${sqlString(BENCHMARK_USER_ID)}
WHERE q.deleted_at IS NULL
  AND q.user_id = ${sqlString(BENCHMARK_USER_ID)}
  AND q.search_vector @@ websearch_to_tsquery('simple', ${sqlString(query)})
ORDER BY rank DESC
LIMIT 30;
`,
    )
    .join('\n')

  return `
\\set ON_ERROR_STOP on
\\timing on

BEGIN;
SELECT set_config('app.rls_bypass', 'system', true);

INSERT INTO users (id, display_name)
VALUES (${sqlString(BENCHMARK_USER_ID)}, 'Search scale benchmark')
ON CONFLICT (id) DO NOTHING;

${targetRuns}

${keepFixtures ? 'COMMIT;' : 'ROLLBACK;'}
\\echo ''
\\echo '${keepFixtures ? 'fixtures kept' : 'fixtures rolled back'} for ${BENCHMARK_USER_ID}'
`
}

function run() {
  const sizes = parseSizes(RAW_SIZES)
  const sql = buildBenchmarkSql({ sizes, query: QUERY, keepFixtures: KEEP_FIXTURES })
  const result = spawnSync('psql', [DB_URL], {
    input: sql,
    stdio: ['pipe', 'inherit', 'inherit'],
    encoding: 'utf8',
  })

  if (result.error) {
    console.error(result.error.message)
    console.error(
      'Instala psql o ejecuta con DATABASE_URL/NETLIFY_DB_URL apuntando a un Postgres accesible.',
    )
    process.exit(1)
  }
  process.exit(result.status ?? 1)
}

run()
