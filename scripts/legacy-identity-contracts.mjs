#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const LEGACY_USER_ID = 'legacy-single-user'

const LEGACY_DEFAULT_RE = new RegExp(
  String.raw`\buser_id\b[\s\S]*?\bDEFAULT\s+['"]${LEGACY_USER_ID}['"]`,
  'i',
)

function migrationSqlFromDisk() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
  const migrationsDir = join(repoRoot, 'netlify/database/migrations')
  return readdirSync(migrationsDir)
    .sort()
    .map((dir) => readFileSync(join(migrationsDir, dir, 'migration.sql'), 'utf8'))
    .join('\n')
}

function splitStatements(sql) {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

function createTableName(statement) {
  return (
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z_]+)/i.exec(statement)?.[1] ?? null
  )
}

function alterTableName(statement) {
  return /ALTER\s+TABLE\s+([a-z_]+)/i.exec(statement)?.[1] ?? null
}

function addsLegacyUserDefault(statement) {
  const created = createTableName(statement)
  if (created && LEGACY_DEFAULT_RE.test(statement)) return created

  const altered = alterTableName(statement)
  if (!altered) return null
  if (
    /\bADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+user_id\b/i.test(statement) &&
    LEGACY_DEFAULT_RE.test(statement)
  ) {
    return altered
  }
  if (
    /\bALTER\s+COLUMN\s+user_id\s+SET\s+DEFAULT\b/i.test(statement) &&
    new RegExp(String.raw`['"]${LEGACY_USER_ID}['"]`, 'i').test(statement)
  ) {
    return altered
  }
  return null
}

function dropsUserDefault(statement) {
  const altered = alterTableName(statement)
  if (!altered) return null
  return /\bALTER\s+COLUMN\s+user_id\s+DROP\s+DEFAULT\b/i.test(statement) ? altered : null
}

export function validateLegacyIdentityCutoverContracts({
  migrationSql = migrationSqlFromDisk(),
} = {}) {
  const legacyDefaultTables = new Set()
  const effectiveDefaults = new Set()

  for (const statement of splitStatements(migrationSql)) {
    const tableWithLegacyDefault = addsLegacyUserDefault(statement)
    if (tableWithLegacyDefault) {
      legacyDefaultTables.add(tableWithLegacyDefault)
      effectiveDefaults.add(tableWithLegacyDefault)
      continue
    }

    const tableWithDroppedDefault = dropsUserDefault(statement)
    if (tableWithDroppedDefault) effectiveDefaults.delete(tableWithDroppedDefault)
  }

  const unresolvedLegacyDefaults = [...effectiveDefaults].sort()
  const messages = unresolvedLegacyDefaults.map(
    (table) =>
      `${table} conserva user_id DEFAULT ${LEGACY_USER_ID}; agrega una migración posterior con ALTER TABLE ${table} ALTER COLUMN user_id DROP DEFAULT.`,
  )

  return {
    ok: messages.length === 0,
    legacyDefaultTables: [...legacyDefaultTables].sort(),
    unresolvedLegacyDefaults,
    messages,
  }
}

export function buildLegacyIdentityReport({
  migrationSql = migrationSqlFromDisk(),
} = {}) {
  const validation = validateLegacyIdentityCutoverContracts({ migrationSql })
  return {
    legacyUserId: LEGACY_USER_ID,
    historicalLegacyDefaultTables: validation.legacyDefaultTables.length,
    unresolvedLegacyDefaults: validation.unresolvedLegacyDefaults.length,
    acceptance: [
      'insert_without_user_id_fails_loudly',
      'anonymous_401_when_clerk_strict',
      'legacy_owner_alias_is_explicit',
      'new_clerk_user_keeps_real_user_id',
      'legacy_identity_is_compatibility_only',
    ],
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = buildLegacyIdentityReport()
  const validation = validateLegacyIdentityCutoverContracts()
  console.log(JSON.stringify(report, null, 2))
  if (!validation.ok) {
    for (const message of validation.messages) console.error(message)
    process.exit(1)
  }
}
