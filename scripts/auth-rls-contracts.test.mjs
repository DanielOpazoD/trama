import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  ENDPOINT_PRIVACY_CONTRACTS,
  PRIVATE_TABLE_CONTRACTS,
  SMOKE_DOMAIN_CONTRACTS,
  buildAuthRlsReport,
  validateAuthRlsContracts,
} from './auth-rls-contracts.mjs'

const root = process.cwd()
const migrationsDir = join(root, 'netlify/database/migrations')

function allMigrationSql() {
  return readdirSync(migrationsDir)
    .sort()
    .map((dir) => readFileSync(join(migrationsDir, dir, 'migration.sql'), 'utf8'))
    .join('\n')
}

function migrationTablesWithUserId(sql) {
  const tables = new Set()
  const createTableRe =
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z_]+)\s*\(([\s\S]*?)\);/gi
  let createMatch
  while ((createMatch = createTableRe.exec(sql))) {
    if (/\buser_id\b/i.test(createMatch[2])) tables.add(createMatch[1])
  }

  const alterAddUserIdRe =
    /ALTER\s+TABLE\s+([a-z_]+)\s+[^;]*\bADD\s+COLUMN\s+user_id\b[^;]*;/gi
  let alterMatch
  while ((alterMatch = alterAddUserIdRe.exec(sql))) tables.add(alterMatch[1])
  return [...tables].sort()
}

describe('Auth/RLS contracts inventory', () => {
  it('mantiene un inventario ejecutable de todas las tablas privadas versionadas', () => {
    const migrationTables = migrationTablesWithUserId(allMigrationSql())
    const contractTables = PRIVATE_TABLE_CONTRACTS.map(
      (contract) => contract.table,
    ).sort()

    expect(contractTables).toEqual(migrationTables)
    for (const contract of PRIVATE_TABLE_CONTRACTS) {
      expect(contract.userId).toBe('required')
      expect(contract.rls).toBe('required')
      expect(contract.ownership).toMatch(/owner|system|shared|event|metric|log/)
      expect(['soft-delete', 'append-only', 'singleton', 'token', 'join']).toContain(
        contract.lifecycle,
      )
      expect(contract.reason.length).toBeGreaterThan(20)
    }
  })

  it('declara una matriz endpoint -> auth -> ownership -> operaciones para superficies privadas', () => {
    const requiredEndpoints = [
      '/api/entities',
      '/api/quotes',
      '/api/notes',
      '/api/recortes',
      '/api/momentos',
      '/api/notas-feed',
      '/api/search',
      '/api/notas-attachments',
      '/api/notas-attachments-file/:key',
      '/api/recortes-image/:userId/:key',
      '/api/momentos-file/:userId/:key',
      '/api/chat-threads',
      '/api/chat-messages',
      '/api/tasks',
      '/api/prompts',
      '/api/favoritos',
      '/api/user-prefs',
      '/api/reading-tables',
      '/api/saved-queries',
      '/api/pdf-studio-saved-pdfs',
      '/api/api-tokens',
      '/api/proactive-suggestions',
      '/api/whatsapp-link',
      '/api/whatsapp-webhook',
      '/api/spotify-plays',
      '/api/x-bookmarks',
      '/api/x-cronica',
    ]
    const byRoute = new Map(
      ENDPOINT_PRIVACY_CONTRACTS.map((contract) => [contract.route, contract]),
    )

    for (const route of requiredEndpoints) {
      expect(byRoute.has(route), `${route} falta en ENDPOINT_PRIVACY_CONTRACTS`).toBe(
        true,
      )
      const contract = byRoute.get(route)
      expect(['required', 'webhook-signature']).toContain(contract.auth)
      expect(contract.ownership.length).toBeGreaterThan(20)
      expect(contract.operations.length).toBeGreaterThan(0)
      expect(contract.evidence.length).toBeGreaterThan(0)
    }
  })

  it('mantiene cada contrato de endpoint conectado a archivos y evidencia reales', () => {
    for (const contract of ENDPOINT_PRIVACY_CONTRACTS) {
      for (const file of contract.files) {
        expect(readFileSync(join(root, file), 'utf8').length).toBeGreaterThan(0)
      }
      for (const file of contract.evidence) {
        expect(readFileSync(join(root, file), 'utf8').length).toBeGreaterThan(0)
      }
    }
  })

  it('declara el smoke productivo como contrato de dominios, incluyendo recortes', () => {
    const domains = SMOKE_DOMAIN_CONTRACTS.map((contract) => contract.domain)
    expect(domains).toEqual([
      'auth',
      'revoked-token',
      'entities',
      'quotes',
      'notes',
      'recortes',
      'notas-feed',
      'search',
      'attachments',
      'blobs',
      'momentos',
    ])

    for (const contract of SMOKE_DOMAIN_CONTRACTS) {
      expect(contract.assertions.length).toBeGreaterThan(0)
      expect(contract.command).toBe('npm run smoke:multiuser:prod')
    }
  })

  it('genera un reporte compacto para CI y revisión de PR', () => {
    const report = buildAuthRlsReport()

    expect(report.privateTables).toBe(PRIVATE_TABLE_CONTRACTS.length)
    expect(report.privateEndpoints).toBe(ENDPOINT_PRIVACY_CONTRACTS.length)
    expect(report.smokeDomains).toContain('recortes')
    expect(report.acceptance).toContain('anonymous_401')
    expect(report.acceptance).toContain('read_isolation')
    expect(report.acceptance).toContain('blob_isolation')
  })

  it('falla con una tabla privada nueva no clasificada en el inventario', () => {
    const result = validateAuthRlsContracts({
      migrationSql: `
        CREATE TABLE future_private_rows (
          id UUID PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          payload JSONB NOT NULL
        );
      `,
    })

    expect(result.ok).toBe(false)
    expect(result.missingPrivateTables).toEqual(['future_private_rows'])
    expect(result.messages.join('\n')).toContain(
      'future_private_rows tiene user_id pero no está en PRIVATE_TABLE_CONTRACTS',
    )
  })

  it('acepta una tabla privada nueva solo cuando viene clasificada con lifecycle y razón', () => {
    const result = validateAuthRlsContracts({
      migrationSql: `
        CREATE TABLE future_private_rows (
          id UUID PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          payload JSONB NOT NULL
        );
      `,
      privateTableContracts: [
        {
          table: 'future_private_rows',
          lifecycle: 'soft-delete',
          userId: 'required',
          rls: 'required',
          ownership: 'owner scoped future private rows',
          reason: 'Synthetic regression fixture for future private tables.',
        },
      ],
    })

    expect(result).toEqual({
      ok: true,
      missingPrivateTables: [],
      malformedPrivateTables: [],
      messages: [],
    })
  })
})
