#!/usr/bin/env node
import { pathToFileURL } from 'node:url'

import {
  buildLegacyIdentityReport,
  validateLegacyIdentityCutoverContracts,
} from './legacy-identity-contracts.mjs'
import { buildUserIdWriteContractReport } from './user-id-write-contracts.mjs'

function tableList(tables) {
  if (tables.length === 0) return '_Ninguna._'
  return tables.map((table) => `- \`${table}\``).join('\n')
}

export function buildLegacyIdentityMarkdownReport({
  contractReport = buildLegacyIdentityReport(),
  writeReport = buildUserIdWriteContractReport(),
  legacyDefaultTables = validateLegacyIdentityCutoverContracts().legacyDefaultTables,
  schemaCheckName = 'check:legacy-identity-schema',
} = {}) {
  return [
    '# Legacy Identity Cutover Report',
    '',
    '## Summary',
    '',
    '| Contrato | Resultado |',
    '| --- | ---: |',
    `| Tenant histórico | \`${contractReport.legacyUserId}\` |`,
    `| Tablas históricas con default legacy | ${contractReport.historicalLegacyDefaultTables} |`,
    `| Defaults legacy efectivos pendientes | ${contractReport.unresolvedLegacyDefaults} |`,
    `| Tablas privadas revisadas para INSERT | ${writeReport.checkedPrivateTables} |`,
    `| Fuentes productivas revisadas | ${writeReport.checkedSources} |`,
    `| Inserts privados sin user_id | ${writeReport.issues} |`,
    `| Warnings de inserts complejos | ${writeReport.warnings ?? 0} |`,
    '',
    '## Checks',
    '',
    '- `check:legacy-identity-contracts` verifica migraciones sin DB.',
    '- `check:user-id-writes` verifica escrituras privadas explícitas.',
    `- \`${schemaCheckName}\` verifica la DB migrada en CI.`,
    '',
    '## Acceptance',
    '',
    ...contractReport.acceptance.map((item) => `- \`${item}\``),
    '',
    '## Tables With Historical Legacy Defaults',
    '',
    tableList(legacyDefaultTables),
    '',
  ].join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(buildLegacyIdentityMarkdownReport())
}
