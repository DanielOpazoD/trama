#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const HOT_ROW_CONTRACT_FILES = [
  'netlify/functions/_lib/entities-endpoint.ts',
  'netlify/functions/quotes.mts',
  'netlify/functions/notes.mts',
  'netlify/functions/_lib/momentos/data.ts',
  'netlify/functions/_lib/search-endpoint.ts',
]

const OPERATIONAL_ROW_ALLOWLIST = new Set([
  '{content:string;promoted:string|null;created_at:string}',
  '{name:string;type:string;year:number|null;description:string|null}',
  '{text:string;source:string|null;context:string|null;entity_id:string}',
  '{deleted_at:string}',
  '{id:string}',
  '{momento_id:string|null}',
  '{restored:boolean}',
])

const OPERATIONAL_ROW_TYPE_ALLOWLIST = new Set(['DupRow', 'EntityIdRow'])

const SQL_TYPED_RE = /\bsqlTyped\s*</g
const PARSE_ROWS_RE = /\bparseRows\s*\(/g

function stripComments(source) {
  let out = ''
  let str = null
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    const next = source[i + 1]
    if (str) {
      out += c
      if (c === '\\') {
        out += next ?? ''
        i += 1
      } else if (c === str) {
        str = null
      }
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      str = c
      out += c
      continue
    }
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      out += '\n'
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' '
        i += 1
      }
      i += 1
      continue
    }
    out += c
  }
  return out
}

function closeIndex(src, openIndex, openChar, closeChar) {
  let depth = 0
  let str = null
  for (let i = openIndex; i < src.length; i++) {
    const c = src[i]
    if (str) {
      if (c === '\\') i += 1
      else if (c === str) str = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') str = c
    else if (c === openChar) depth += 1
    else if (c === closeChar) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function splitTopLevel(argsText) {
  const args = []
  let depth = 0
  let str = null
  let start = 0
  for (let i = 0; i < argsText.length; i++) {
    const c = argsText[i]
    if (str) {
      if (c === '\\') i += 1
      else if (c === str) str = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') str = c
    else if (c === '(' || c === '[' || c === '{') depth += 1
    else if (c === ')' || c === ']' || c === '}') depth -= 1
    else if (c === ',' && depth === 0) {
      args.push(argsText.slice(start, i))
      start = i + 1
    }
  }
  args.push(argsText.slice(start))
  return args
}

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length
}

function compactType(typeText) {
  const trimmed = typeText.trim().replace(/\r\n/g, '\n')
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const body = trimmed.slice(1, -1)
    const fields = body
      .split(/[\n;]/)
      .map((field) =>
        field
          .trim()
          .replace(/,$/, '')
          .replace(/\s*:\s*/g, ':')
          .replace(/\s*\|\s*/g, '|')
          .replace(/\s+/g, ''),
      )
      .filter(Boolean)
    return `{${fields.join(';')}}`
  }
  return trimmed.replace(/\s+/g, '')
}

function readSqlTypedCall(source, start) {
  const genericOpen = source.indexOf('<', start)
  if (genericOpen === -1) return null
  const genericClose = closeIndex(source, genericOpen, '<', '>')
  if (genericClose === -1) return null
  const afterGeneric = source.slice(genericClose + 1).match(/^\s*\(/)
  if (!afterGeneric) return null
  const callOpen = genericClose + 1 + afterGeneric[0].length - 1
  const callClose = closeIndex(source, callOpen, '(', ')')
  return {
    start,
    end: callClose === -1 ? source.length : callClose + 1,
    rowType: source.slice(genericOpen + 1, genericClose).trim(),
  }
}

function collectSqlTypedCalls(source) {
  const calls = []
  for (const match of source.matchAll(SQL_TYPED_RE)) {
    const call = readSqlTypedCall(source, match.index)
    if (call) calls.push(call)
  }
  return calls
}

function isValidParseRowsCall(source, openParen) {
  const closeParen = closeIndex(source, openParen, '(', ')')
  if (closeParen === -1) return { end: source.length, valid: false }
  const args = splitTopLevel(source.slice(openParen + 1, closeParen))
  const hasSchema = /\b[A-Z][A-Za-z0-9]*(?:Row)?Schema\b/.test(args[1] ?? '')
  const hasContext = /['"][a-z0-9_.:-]+['"]/.test(args[2] ?? '')
  return {
    end: closeParen + 1,
    valid: args.length >= 3 && hasSchema && hasContext,
  }
}

function collectParseRowsSpans(source) {
  const spans = []
  for (const match of source.matchAll(PARSE_ROWS_RE)) {
    const openParen = match.index + match[0].length - 1
    const call = isValidParseRowsCall(source, openParen)
    spans.push({
      start: match.index,
      end: call.end,
      valid: call.valid,
    })
  }
  return spans
}

function findCoveringParseRows(spans, index) {
  return spans.find((span) => span.start <= index && index < span.end)
}

function isOperationalRow(rowType) {
  return (
    OPERATIONAL_ROW_ALLOWLIST.has(compactType(rowType)) ||
    OPERATIONAL_ROW_TYPE_ALLOWLIST.has(rowType)
  )
}

function scanFile({ root, relFile }) {
  const absFile = resolve(root, relFile)
  if (!existsSync(absFile)) return null
  const source = stripComments(readFileSync(absFile, 'utf8'))
  const parseRowsSpans = collectParseRowsSpans(source)
  const covered = []
  const allowed = []
  const violations = []

  for (const call of collectSqlTypedCalls(source)) {
    const rowType = call.rowType
    const covering = findCoveringParseRows(parseRowsSpans, call.start)
    if (covering?.valid) {
      covered.push({ file: relFile, line: lineAt(source, call.start), rowType })
      continue
    }
    if (isOperationalRow(rowType)) {
      allowed.push({ file: relFile, line: lineAt(source, call.start), rowType })
      continue
    }
    violations.push({
      file: relFile,
      line: lineAt(source, call.start),
      rowType,
      message: `sqlTyped<${rowType}> debe estar envuelto por parseRows(..., RowSchema, 'context') en archivos hot.`,
    })
  }

  return { file: relFile, covered, allowed, violations }
}

export function checkRowRuntimeContracts({
  root = process.cwd(),
  files = HOT_ROW_CONTRACT_FILES,
} = {}) {
  const projectRoot = resolve(root)
  const scannedFiles = []
  const covered = []
  const allowed = []
  const violations = []

  for (const relFile of files) {
    const normalized = relative(projectRoot, resolve(projectRoot, relFile))
    const result = scanFile({ root: projectRoot, relFile: normalized })
    if (!result) continue
    scannedFiles.push(normalized)
    covered.push(...result.covered)
    allowed.push(...result.allowed)
    violations.push(...result.violations)
  }

  violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  return {
    ok: violations.length === 0,
    scannedFiles,
    covered,
    allowed,
    violations,
  }
}

function printResult(result) {
  if (result.ok) {
    console.log(
      `row runtime contracts ok: ${result.covered.length} validated, ${result.allowed.length} operational allowlisted across ${result.scannedFiles.length} files.`,
    )
    return
  }
  console.error('row runtime contracts failed:')
  for (const violation of result.violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.message}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkRowRuntimeContracts()
  printResult(result)
  if (!result.ok) process.exitCode = 1
}
