#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PRIVATE_TABLE_CONTRACTS } from './auth-rls-contracts.mjs'
import { listFilesRecursive } from './lib/source-files.mjs'

const ROOT = process.cwd()
const FUNCTIONS_DIR = join(ROOT, 'netlify/functions')

const INSERT_RE = /\bINSERT\s+INTO\s+([a-z_]+)\s*\(([^)]*)\)/gi
const INSERT_STATEMENT_RE = /\bINSERT\s+INTO\s+([a-z_]+)\b([\s\S]*?)(?=;|`|$)/gi

export const USER_ID_WRITE_WARNING_ALLOWLIST = [
  {
    file: 'netlify/functions/_lib/pdf-studio-templates-endpoint.ts',
    table: 'pdf_studio_template_versions',
    kind: 'insert_select_manual_review',
    reason:
      'El INSERT…SELECT copia user_id desde la CTE `head`, que ya filtra por el user_id autenticado; el snapshot hereda el owner correcto por construcción.',
  },
]

// Funciones de producción: `.ts`/`.mts`, sin tests.
function isProductionFunctionFile(file) {
  if (!/\.(mts|ts)$/.test(file)) return false
  return !file.endsWith('.test.ts') && !file.endsWith('.test.mts')
}

function productionSources() {
  return listFilesRecursive(FUNCTIONS_DIR)
    .filter(isProductionFunctionFile)
    .map((file) => ({
      file: relative(ROOT, file),
      source: readFileSync(file, 'utf8'),
    }))
}

function parseColumns(rawColumns) {
  return rawColumns
    .split(',')
    .map((column) => column.replace(/--.*$/gm, '').trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '')
}

function enclosingTemplateLiteral(source, index) {
  const start = source.lastIndexOf('`', index)
  if (start < 0) return source

  const end = source.indexOf('`', index)
  if (end < 0) return source.slice(start + 1)

  return source.slice(start + 1, end)
}

function splitTopLevelCsv(value) {
  const parts = []
  let current = ''
  let depth = 0
  let inSingleQuote = false
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    const next = value[i + 1]
    if (char === "'" && next === "'") {
      current += char + next
      i += 1
      continue
    }
    if (char === "'") inSingleQuote = !inSingleQuote
    if (!inSingleQuote) {
      if (char === '(') depth += 1
      if (char === ')' && depth > 0) depth -= 1
      if (char === ',' && depth === 0) {
        parts.push(current.trim())
        current = ''
        continue
      }
    }
    current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function leadingSelectList(sqlFragment) {
  const selectMatch = /^\s*SELECT\b/i.exec(sqlFragment)
  if (!selectMatch) return null

  let depth = 0
  let inSingleQuote = false
  for (let i = selectMatch[0].length; i < sqlFragment.length; i += 1) {
    const char = sqlFragment[i]
    const next = sqlFragment[i + 1]
    if (char === "'" && next === "'") {
      i += 1
      continue
    }
    if (char === "'") inSingleQuote = !inSingleQuote
    if (inSingleQuote) continue

    if (char === '(') depth += 1
    else if (char === ')' && depth > 0) depth -= 1
    else if (
      depth === 0 &&
      /^(?:FROM|WHERE|RETURNING|ON\s+CONFLICT)\b/i.test(sqlFragment.slice(i).trimStart())
    ) {
      return sqlFragment.slice(selectMatch[0].length, i).trim()
    }
  }
  return null
}

function compactSqlExpression(expression) {
  return expression.replace(/\s+/g, ' ').trim()
}

function isAuthenticatedUserParameter(expression) {
  return /^\$\{(?:userId|ownerUserId)\}(?:::[a-z_][a-z0-9_]*(?:\[\])?)?$/i.test(
    compactSqlExpression(expression),
  )
}

function isAliasOwnerGated(source, alias) {
  const aliasBodyRe = new RegExp(`\\b${alias}\\s+AS\\s*\\(([\\s\\S]*?)\\)\\s*,`, 'i')
  const body = aliasBodyRe.exec(source)?.[1]
  return Boolean(body && /\buser_id\s*=\s*\$\{(?:userId|ownerUserId)\}/i.test(body))
}

function isSelectedUserIdOwnerGated(afterColumnList) {
  return /\bFROM\b[\s\S]*?\bWHERE\b[\s\S]*?\buser_id\s*=\s*\$\{(?:userId|ownerUserId)\}/i.test(
    afterColumnList,
  )
}

function isProvableInsertSelectUserId({ columns, source, afterColumnList }) {
  const userIdIndex = columns.indexOf('user_id')
  if (userIdIndex < 0) return false

  const selectList = leadingSelectList(afterColumnList)
  if (!selectList) return false

  const selectExpressions = splitTopLevelCsv(selectList)
  const userIdExpression = selectExpressions[userIdIndex]
  if (!userIdExpression) return false

  if (isAuthenticatedUserParameter(userIdExpression)) return true

  const compactExpression = compactSqlExpression(userIdExpression)
  const aliasMatch = /^([a-z_][a-z0-9_]*)\.user_id$/i.exec(compactExpression)
  if (aliasMatch) return isAliasOwnerGated(source, aliasMatch[1])

  if (/^user_id$/i.test(compactExpression)) {
    return isSelectedUserIdOwnerGated(afterColumnList)
  }

  return false
}

export function findUserIdWriteContractIssues({
  privateTables = PRIVATE_TABLE_CONTRACTS.map((contract) => contract.table),
  sources = productionSources(),
} = {}) {
  const privateTableSet = new Set(privateTables)
  const issues = []

  for (const { file, source } of sources) {
    const searchableSource = stripComments(source)
    let match
    while ((match = INSERT_RE.exec(searchableSource))) {
      const table = match[1]
      if (!privateTableSet.has(table)) continue

      const columns = parseColumns(match[2])
      if (columns.includes('user_id')) continue

      issues.push({
        file,
        table,
        columns,
        message: `${file} inserta en ${table} sin columna user_id explicita.`,
      })
    }
  }

  return issues.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file)
    return a.table.localeCompare(b.table)
  })
}

export function findUserIdWriteContractWarnings({
  privateTables = PRIVATE_TABLE_CONTRACTS.map((contract) => contract.table),
  sources = productionSources(),
} = {}) {
  const privateTableSet = new Set(privateTables)
  const warnings = []

  for (const { file, source } of sources) {
    const searchableSource = stripComments(source)
    let match
    while ((match = INSERT_STATEMENT_RE.exec(searchableSource))) {
      const table = match[1]
      if (!privateTableSet.has(table)) continue

      const afterTable = match[2] ?? ''
      const startsWithColumnList = /^\s*\(/.test(afterTable)
      if (!startsWithColumnList) {
        warnings.push({
          file,
          table,
          kind: 'insert_without_column_list',
          message: `${file} usa INSERT INTO ${table} sin lista de columnas; no se puede verificar user_id estaticamente.`,
        })
        continue
      }

      const openColumnList = afterTable.indexOf('(')
      const closeColumnList = afterTable.indexOf(')', openColumnList + 1)
      const afterColumnList =
        closeColumnList >= 0 ? afterTable.slice(closeColumnList + 1).trimStart() : ''
      if (/^SELECT\b/i.test(afterColumnList)) {
        const columns = parseColumns(
          afterTable.slice(openColumnList + 1, closeColumnList),
        )
        const statementScope = enclosingTemplateLiteral(searchableSource, match.index)
        if (
          isProvableInsertSelectUserId({
            columns,
            source: statementScope,
            afterColumnList,
          })
        ) {
          continue
        }
        warnings.push({
          file,
          table,
          kind: 'insert_select_manual_review',
          message: `${file} usa INSERT INTO ${table} ... SELECT; verifica que user_id venga del owner autenticado.`,
        })
      }
    }
  }

  return warnings.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file)
    if (a.table !== b.table) return a.table.localeCompare(b.table)
    return a.kind.localeCompare(b.kind)
  })
}

function warningKey(warning) {
  return `${warning.file}::${warning.table}::${warning.kind}`
}

function acceptedWarningReasons(allowlist = USER_ID_WRITE_WARNING_ALLOWLIST) {
  return new Map(allowlist.map((entry) => [warningKey(entry), entry.reason]))
}

export function splitAcceptedUserIdWriteWarnings(
  warnings,
  allowlist = USER_ID_WRITE_WARNING_ALLOWLIST,
) {
  const reasons = acceptedWarningReasons(allowlist)
  const accepted = []
  const unresolved = []
  for (const warning of warnings) {
    const reason = reasons.get(warningKey(warning))
    if (reason) accepted.push({ ...warning, reason })
    else unresolved.push(warning)
  }
  return { accepted, unresolved }
}

export function buildUserIdWriteContractReport(options = {}) {
  const issues = findUserIdWriteContractIssues(options)
  const allWarnings = findUserIdWriteContractWarnings(options)
  const { accepted, unresolved } = splitAcceptedUserIdWriteWarnings(
    allWarnings,
    options.warningAllowlist,
  )
  const sources = options.sources ?? productionSources()
  return {
    checkedPrivateTables: options.privateTables?.length ?? PRIVATE_TABLE_CONTRACTS.length,
    checkedSources: sources.length,
    issues: issues.length,
    warnings: unresolved.length,
    acceptedWarnings: accepted.length,
    acceptedWarningDetails: accepted,
  }
}

export function hasBlockingUserIdWriteFindings(report) {
  return report.issues > 0 || report.warnings > 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = buildUserIdWriteContractReport()
  const issues = findUserIdWriteContractIssues()
  console.log(JSON.stringify(report, null, 2))
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(issue.message)
      console.error(`  columnas: ${issue.columns.join(', ') || '(sin columnas)'}`)
    }
    process.exit(1)
  }
  const warnings = findUserIdWriteContractWarnings()
  const { accepted, unresolved } = splitAcceptedUserIdWriteWarnings(warnings)
  for (const warning of unresolved) console.warn(warning.message)
  for (const warning of accepted) {
    console.warn(`${warning.message} ACEPTADO: ${warning.reason}`)
  }
  if (unresolved.length > 0) process.exit(1)
}
