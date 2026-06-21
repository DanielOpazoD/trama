import { describe, expect, it } from 'vitest'
import { evaluateLegacyIdentitySchemaRows } from './check-legacy-identity-schema.mjs'

describe('legacy identity schema checker', () => {
  it('acepta columnas user_id NOT NULL sin DEFAULT operativo', () => {
    const result = evaluateLegacyIdentitySchemaRows([
      { table_name: 'notes', column_default: null, is_nullable: 'NO' },
      { table_name: 'quotes', column_default: null, is_nullable: 'NO' },
    ])

    expect(result).toEqual({ ok: true, issues: [] })
  })

  it('rechaza columnas user_id que conservan DEFAULT legacy', () => {
    const result = evaluateLegacyIdentitySchemaRows([
      {
        table_name: 'notes',
        column_default: "'legacy-single-user'::text",
        is_nullable: 'NO',
      },
    ])

    expect(result.ok).toBe(false)
    expect(result.issues.join('\n')).toContain(
      'notes.user_id conserva DEFAULT legacy-single-user',
    )
  })

  it('rechaza columnas user_id nullable en tablas del cutover', () => {
    const result = evaluateLegacyIdentitySchemaRows([
      { table_name: 'notes', column_default: null, is_nullable: 'YES' },
    ])

    expect(result.ok).toBe(false)
    expect(result.issues.join('\n')).toContain('notes.user_id debe ser NOT NULL')
  })
})
