#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { execFileSync } from 'node:child_process'

const ALLOWED_HARD_DELETE_TABLES = new Map([
  [
    'ai_task_providers',
    'Per-user AI override rows: absence means "fall back to env default"; no deleted_at column.',
  ],
  [
    'alert_state',
    'Ephemeral alert throttle state; clearing the row lets a recovered budget alert notify again.',
  ],
  [
    'entity_types',
    'Global catalog row; endpoint rejects delete while any visible entity uses the slug.',
  ],
  [
    'relationship_types',
    'Global catalog row; endpoint rejects delete while any visible relationship uses the slug.',
  ],
  ['llm_cache', 'Expired cache garbage collection; rows are derived and disposable.'],
  ['spotify_tokens', 'OAuth disconnect must remove secret token material.'],
  ['x_tokens', 'OAuth disconnect must remove secret token material.'],
])

const roots = ['netlify/functions', 'src', 'scripts']
const files = execFileSync('git', ['ls-files', ...roots], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => /\.(ts|tsx|mts|js|mjs)$/.test(file))
  .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))

const violations = []
const seen = new Set()
const deleteFromPattern = /\bDELETE\s+FROM\s+([a-z_][a-z0-9_]*)\b/gi

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(deleteFromPattern)) {
    const table = match[1]
    seen.add(table)
    if (!ALLOWED_HARD_DELETE_TABLES.has(table)) {
      violations.push(`${relative(process.cwd(), file)}: DELETE FROM ${table}`)
    }
  }
}

const staleAllowlist = Array.from(ALLOWED_HARD_DELETE_TABLES.keys()).filter(
  (table) => !seen.has(table),
)

if (violations.length > 0 || staleAllowlist.length > 0) {
  if (violations.length > 0) {
    console.error('Hard-delete statements outside the allowlist:')
    for (const violation of violations) console.error(`  - ${violation}`)
  }
  if (staleAllowlist.length > 0) {
    console.error('Hard-delete allowlist entries no longer used:')
    for (const table of staleAllowlist) console.error(`  - ${table}`)
  }
  process.exit(1)
}

console.log('hard-delete allowlist ok')
