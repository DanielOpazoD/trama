#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = join(import.meta.dirname, '..')
const BASELINE_FILE = '.dependency-cruiser-known-violations.json'
const DEPCRUISE_BIN = join(
  ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'depcruise.cmd' : 'depcruise',
)
const DEPCRUISE_ARGS = [
  '--config',
  '.dependency-cruiser.cjs',
  '--output-type',
  'json',
  'src',
  'netlify/functions',
  'extension',
  'scripts',
]

function violationKey({ rule, from, to }) {
  return `${rule}|${from}|${to}`
}

function normalizeViolation(violation) {
  return {
    rule: violation.rule?.name ?? 'unknown-rule',
    from: violation.from,
    to: violation.to,
  }
}

function loadBaseline(root) {
  const baselinePath = join(root, BASELINE_FILE)
  if (!existsSync(baselinePath)) return []
  const parsed = JSON.parse(readFileSync(baselinePath, 'utf8'))
  return parsed.knownViolations ?? []
}

function runDependencyCruiser(root) {
  const output = execFileSync(DEPCRUISE_BIN, DEPCRUISE_ARGS, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  })
  const parsed = JSON.parse(output)
  return (parsed.summary?.violations ?? []).map(normalizeViolation)
}

function formatViolation(violation) {
  return `- ${violation.rule}: ${violation.from} -> ${violation.to}`
}

export function findArchitectureBoundaryIssues(root = ROOT) {
  const violations = runDependencyCruiser(root)
  const baseline = loadBaseline(root)
  const known = new Set(baseline.map(violationKey))
  const current = new Set(violations.map(violationKey))

  return {
    baselineCount: baseline.length,
    currentCount: violations.length,
    newViolations: violations.filter((violation) => !known.has(violationKey(violation))),
    staleBaseline: baseline.filter((violation) => !current.has(violationKey(violation))),
  }
}

export function formatArchitectureBoundaryIssues(result) {
  const lines = []
  if (result.newViolations.length > 0) {
    lines.push(
      `${result.newViolations.length} new architecture violation(s):`,
      ...result.newViolations.map(formatViolation),
    )
  }
  if (result.staleBaseline.length > 0) {
    lines.push(
      `${result.staleBaseline.length} stale architecture baseline entrie(s):`,
      ...result.staleBaseline.map(formatViolation),
    )
  }
  return lines.join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = findArchitectureBoundaryIssues(ROOT)
  const output = formatArchitectureBoundaryIssues(result)
  if (output) {
    console.error(
      `Architecture boundary contract failed for ${relative(process.cwd(), ROOT)}:\n${output}`,
    )
    process.exit(1)
  }
  console.log(
    `Architecture boundaries OK. ${result.currentCount} known violation(s) matched baseline.`,
  )
}
