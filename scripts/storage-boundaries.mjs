#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SCAN_DIRS = ['netlify/functions', 'scripts']
const ALLOWED_BLOBS_IMPORTS = new Set([
  'netlify/functions/_lib/storage-adapter.ts',
  'scripts/legacy-data-reassignment-dry-run.mjs',
])

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.netlify'])
const SOURCE_EXT_RE = /\.(?:ts|mts|js|mjs)$/
const TEST_FILE_RE = /\.(?:test|spec)\.(?:ts|mts|js|mjs)$/
const NETLIFY_BLOBS_IMPORT_RE =
  /from\s+['"]@netlify\/blobs['"]|import\s*\(\s*['"]@netlify\/blobs['"]\s*\)/

function toPosix(path) {
  return path.split('\\').join('/')
}

function walk(root, dir, files = []) {
  const absolute = join(root, dir)
  if (!existsSync(absolute)) return files
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue
    const child = join(dir, entry.name)
    if (entry.isDirectory()) walk(root, child, files)
    else if (SOURCE_EXT_RE.test(entry.name) && !TEST_FILE_RE.test(entry.name)) {
      files.push(toPosix(child))
    }
  }
  return files
}

function tryRead(root, file, issues) {
  try {
    return readFileSync(join(root, file), 'utf8')
  } catch {
    issues.push({ file, message: 'could not read storage boundary file' })
    return ''
  }
}

export function validateStorageBoundaries({ root = process.cwd() } = {}) {
  const issues = []
  const files = SCAN_DIRS.flatMap((dir) => walk(root, dir))

  for (const file of files) {
    const source = tryRead(root, file, issues)
    if (!NETLIFY_BLOBS_IMPORT_RE.test(source)) continue
    if (!ALLOWED_BLOBS_IMPORTS.has(file)) {
      issues.push({
        file,
        message: 'Netlify Blobs imports must use storage-adapter',
      })
    }
  }

  const pkg = JSON.parse(tryRead(root, 'package.json', issues) || '{}')
  if (
    pkg.scripts?.['check:storage-boundaries'] !== 'node scripts/storage-boundaries.mjs'
  ) {
    issues.push({
      file: 'package.json',
      message: 'missing check:storage-boundaries script',
    })
  }

  const workflow = tryRead(root, '.github/workflows/test.yml', issues)
  if (!workflow.includes('Storage boundaries contract')) {
    issues.push({
      file: '.github/workflows/test.yml',
      message: 'CI must name the storage boundaries gate',
    })
  }
  if (!workflow.includes('npm run check:storage-boundaries')) {
    issues.push({
      file: '.github/workflows/test.yml',
      message: 'CI must run check:storage-boundaries',
    })
  }

  return { ok: issues.length === 0, issues }
}

export function formatStorageBoundaryReport(result) {
  const lines = [`storage_boundaries: ${result.ok ? 'ok' : 'failed'}`, '']
  for (const issue of result.issues) {
    lines.push(`- ${issue.file}: ${issue.message}`)
  }
  return lines.join('\n').trimEnd() + '\n'
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validateStorageBoundaries()
  process.stdout.write(formatStorageBoundaryReport(result))
  if (!result.ok) process.exit(1)
}
