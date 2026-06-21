import { describe, expect, it } from 'vitest'
import { buildLegacyIdentityMarkdownReport } from './legacy-identity-report.mjs'

describe('legacy identity report', () => {
  it('resume tablas, defaults removidos y checks del cutover', () => {
    const markdown = buildLegacyIdentityMarkdownReport({
      contractReport: {
        legacyUserId: 'legacy-single-user',
        historicalLegacyDefaultTables: 2,
        unresolvedLegacyDefaults: 0,
        acceptance: ['insert_without_user_id_fails_loudly'],
      },
      schemaCheckName: 'check:legacy-identity-schema',
      writeReport: {
        checkedPrivateTables: 40,
        checkedSources: 238,
        issues: 0,
        warnings: 1,
      },
      legacyDefaultTables: ['notes', 'momentos'],
    })

    expect(markdown).toContain('# Legacy Identity Cutover Report')
    expect(markdown).toContain('| Tablas históricas con default legacy | 2 |')
    expect(markdown).toContain('| Defaults legacy efectivos pendientes | 0 |')
    expect(markdown).toContain('| Inserts privados sin user_id | 0 |')
    expect(markdown).toContain('| Warnings de inserts complejos | 1 |')
    expect(markdown).toContain('`check:legacy-identity-schema`')
    expect(markdown).toContain('`notes`')
    expect(markdown).toContain('`momentos`')
  })
})
