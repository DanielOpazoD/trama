#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

export const LEGACY_MEDIA_FALLBACK_BASELINE = 1
export const LEGACY_MEDIA_FALLBACK_ALLOWLIST = new Set([
  'src/components/momentos/AuthenticatedMedia.tsx',
])

const SOURCE_EXT_RE = /\.(ts|tsx|js|mjs)$/
const TEST_FILE_RE = /(\.test|\.spec)\.(ts|tsx|js|mjs)$/
const EMPTY_HEADERS_RE = /\bheaders\s*:\s*\{\s*\}/
const MOMENTOS_FILE_ROUTE_RE = /\/api\/momentos-file\//

function walkSourceFiles(root, dir = 'src') {
  const base = join(root, dir)
  const entries = readdirSync(base, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = join(base, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(root, relative(root, absolute)))
      continue
    }
    if (!SOURCE_EXT_RE.test(entry.name) || TEST_FILE_RE.test(entry.name)) continue
    files.push(relative(root, absolute))
  }
  return files.sort()
}

function readRepoFiles(root) {
  return Object.fromEntries(
    walkSourceFiles(root).map((file) => [file, readFileSync(join(root, file), 'utf8')]),
  )
}

function findMatchingParen(source, openParenIndex) {
  let depth = 0
  let quote = null
  let escaped = false

  for (let index = openParenIndex; index < source.length; index += 1) {
    const char = source[index]

    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) quote = null
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

export function extractFetchCalls(source) {
  const calls = []
  const fetchRe = /\bfetch\s*\(/g
  let match

  while ((match = fetchRe.exec(source))) {
    const openParenIndex = source.indexOf('(', match.index)
    const closeParenIndex = findMatchingParen(source, openParenIndex)
    if (closeParenIndex === -1) continue
    calls.push(source.slice(match.index, closeParenIndex + 1))
    fetchRe.lastIndex = closeParenIndex + 1
  }

  return calls
}

function countFallbacks({ file, source, allowlist }) {
  const shouldInspectEmptyHeaders =
    allowlist.has(file) || MOMENTOS_FILE_ROUTE_RE.test(source)
  if (!shouldInspectEmptyHeaders) return 0

  return extractFetchCalls(source).filter((call) => EMPTY_HEADERS_RE.test(call)).length
}

export function checkLegacyMediaFallbacks({
  root = process.cwd(),
  files = readRepoFiles(root),
  baseline = LEGACY_MEDIA_FALLBACK_BASELINE,
  allowlist = LEGACY_MEDIA_FALLBACK_ALLOWLIST,
} = {}) {
  const entries = Object.entries(files)
    .map(([file, source]) => ({
      file,
      count: countFallbacks({ file, source, allowlist }),
    }))
    .filter((entry) => entry.count > 0)
  const failures = []

  for (const entry of entries) {
    if (!allowlist.has(entry.file)) {
      failures.push({
        file: entry.file,
        count: entry.count,
        reason: 'unauthenticated_legacy_media_fetch_not_allowlisted',
      })
    }
  }

  const total = entries.reduce((sum, entry) => sum + entry.count, 0)
  if (total > baseline) {
    for (const entry of entries.filter((item) => allowlist.has(item.file))) {
      failures.push({
        file: entry.file,
        count: entry.count,
        reason: 'legacy_media_fallback_baseline_exceeded',
      })
    }
  }

  return {
    ok: failures.length === 0,
    count: total,
    baseline,
    allowlistedFiles: [...allowlist].sort(),
    failures,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkLegacyMediaFallbacks()
  console.log('\nLegacy media fallback guardrail:')
  console.log('------------------------------------------------------------------------')
  console.log(
    `  fetch sin auth para media legacy     ${String(result.count).padStart(3)}/${result.baseline}`,
  )
  console.log('------------------------------------------------------------------------')
  if (!result.ok) {
    for (const failure of result.failures) {
      console.error(`${failure.file}: ${failure.reason} (${failure.count})`)
    }
    process.exitCode = 1
  } else {
    console.log('\nlegacy media fallback guardrail ok\n')
  }
}
