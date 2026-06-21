import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LEGACY_USER_ID,
  buildLegacyIdentityReport,
  validateLegacyIdentityCutoverContracts,
} from './legacy-identity-contracts.mjs'

const root = process.cwd()
const migrationsDir = join(root, 'netlify/database/migrations')

function allMigrationSql() {
  return readdirSync(migrationsDir)
    .sort()
    .map((dir) => readFileSync(join(migrationsDir, dir, 'migration.sql'), 'utf8'))
    .join('\n')
}

describe('Legacy identity cutover contracts', () => {
  it('detecta una tabla que conserva DEFAULT legacy sin DROP DEFAULT posterior', () => {
    const result = validateLegacyIdentityCutoverContracts({
      migrationSql: `
        CREATE TABLE notes (
          id uuid PRIMARY KEY,
          user_id text NOT NULL DEFAULT 'legacy-single-user'
        );
      `,
    })

    expect(result.ok).toBe(false)
    expect(result.unresolvedLegacyDefaults).toEqual(['notes'])
    expect(result.messages.join('\n')).toContain(
      'notes conserva user_id DEFAULT legacy-single-user',
    )
  })

  it('acepta una tabla historica cuando una migracion posterior quita el DEFAULT legacy', () => {
    const result = validateLegacyIdentityCutoverContracts({
      migrationSql: `
        CREATE TABLE notes (
          id uuid PRIMARY KEY,
          user_id text NOT NULL DEFAULT 'legacy-single-user'
        );

        ALTER TABLE notes ALTER COLUMN user_id DROP DEFAULT;
      `,
    })

    expect(result).toEqual({
      ok: true,
      legacyDefaultTables: ['notes'],
      unresolvedLegacyDefaults: [],
      messages: [],
    })
  })

  it('mantiene el repo sin defaults legacy efectivos en tablas privadas', () => {
    const result = validateLegacyIdentityCutoverContracts({
      migrationSql: allMigrationSql(),
    })

    expect(result.ok).toBe(true)
    expect(result.unresolvedLegacyDefaults).toEqual([])
  })

  it('reporta el estado de cutover para CI y revision de PR', () => {
    const report = buildLegacyIdentityReport({ migrationSql: allMigrationSql() })

    expect(report.legacyUserId).toBe(LEGACY_USER_ID)
    expect(report.unresolvedLegacyDefaults).toBe(0)
    expect(report.acceptance).toContain('insert_without_user_id_fails_loudly')
    expect(report.acceptance).toContain('legacy_identity_is_compatibility_only')
  })
})
