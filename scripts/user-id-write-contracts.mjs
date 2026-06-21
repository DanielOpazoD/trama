#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PRIVATE_TABLE_CONTRACTS } from './auth-rls-contracts.mjs'

const ROOT = process.cwd()
const FUNCTIONS_DIR = join(ROOT, 'netlify/functions')

const INSERT_RE = /\bINSERT\s+INTO\s+([a-z_]+)\s*\(([^)]*)\)/gi
const INSERT_STATEMENT_RE = /\bINSERT\s+INTO\s+([a-z_]+)\b([\s\S]*?)(?=;|$)/gi

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      out.push(...walk(full))
      continue
    }
    if (!/\.(mts|ts)$/.test(entry)) continue
    if (entry.endsWith('.test.ts') || entry.endsWith('.test.mts')) continue
    out.push(full)
  }
  return out
}

function productionSources() {
  return walk(FUNCTIONS_DIR).map((file) => ({
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

      const closeColumnList = afterTable.indexOf(')')
      const afterColumnList =
        closeColumnList >= 0 ? afterTable.slice(closeColumnList + 1).trimStart() : ''
      if (/^SELECT\b/i.test(afterColumnList)) {
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

export function buildUserIdWriteContractReport() {
  const issues = findUserIdWriteContractIssues()
  const warnings = findUserIdWriteContractWarnings()
  return {
    checkedPrivateTables: PRIVATE_TABLE_CONTRACTS.length,
    checkedSources: productionSources().length,
    issues: issues.length,
    warnings: warnings.length,
  }
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
  for (const warning of warnings) console.warn(warning.message)
}
