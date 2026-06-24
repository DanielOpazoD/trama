#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

import { listFilesRecursive } from './lib/source-files.mjs'

const SOURCE_DIRS = ['src']

const ALLOWLIST = new Set([
  'src/lib/pdfStudio/pdfRuntime/pdfjsLoader.ts',
  'src/lib/pdfStudio/pdfRuntime/pdfLibLoader.ts',
])

const RUNTIME_IMPORT_CHECKS = [
  {
    name: 'pdfjs-runtime-loader',
    reason: 'pdf.js y su worker deben cargarse vía pdfjsLoader para no duplicar frontera',
    pattern: /(?:import\(['"]pdfjs-dist|from ['"]pdfjs-dist|pdf\.worker\.min\.mjs\?url)/,
  },
  {
    name: 'pdf-lib-dynamic-loader',
    reason:
      'los imports dinámicos de pdf-lib/fontkit deben pasar por pdfLibLoader para mantener caché y contrato',
    pattern: /import\(['"](?:pdf-lib|@pdf-lib\/fontkit)['"]\)/,
  },
]

function isTypeOnlyPdfLibImport(block) {
  if (block.trimStart().startsWith('import type ')) return true

  const namedImport = block.match(/^import\s*\{([\s\S]*?)\}\s*from\s+['"]pdf-lib['"]/)
  if (!namedImport) return false

  const specifiers = namedImport[1]
    .split(',')
    .map((specifier) => specifier.trim())
    .filter(Boolean)
  return (
    specifiers.length > 0 &&
    specifiers.every((specifier) => specifier.startsWith('type '))
  )
}

function staticRuntimePdfLibImports(lines) {
  const issues = []
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trimStart()
    if (!trimmed.startsWith('import ') || trimmed.startsWith('import type ')) {
      continue
    }

    const startLine = index + 1
    const block = [lines[index]]
    while (index + 1 < lines.length) {
      const joined = block.join('\n')
      if (/\sfrom\s+['"][^'"]+['"]/.test(joined) || lines[index].includes(';')) {
        break
      }
      index += 1
      block.push(lines[index])
    }

    const joinedBlock = block.join('\n')
    if (!/\sfrom\s+['"]pdf-lib['"]/.test(joinedBlock)) continue
    if (isTypeOnlyPdfLibImport(joinedBlock)) continue
    issues.push({
      check: 'pdf-lib-static-loader',
      line: startLine,
      text: joinedBlock.trim(),
      reason:
        'el runtime estatico de pdf-lib debe cargarse via pdfLibLoader; import type esta permitido',
    })
  }
  return issues
}

// `.ts`/`.tsx` salvo tests (`.test.`); incluye `.d.ts` a propósito.
function isPdfSourceFile(file) {
  return /\.(?:ts|tsx)$/.test(file) && !file.includes('.test.')
}

function readSourceFiles(root) {
  return SOURCE_DIRS.flatMap((dir) =>
    listFilesRecursive(join(root, dir)).filter(isPdfSourceFile),
  )
}

/**
 * Finds direct PDF runtime imports that bypass the shared PDF Studio loaders.
 */
export function findPdfRuntimeBoundaryIssues({ root = process.cwd() } = {}) {
  const resolvedRoot = resolve(root)
  const issues = []

  for (const path of readSourceFiles(resolvedRoot)) {
    const file = relative(resolvedRoot, path)
    if (ALLOWLIST.has(file)) continue

    const lines = readFileSync(path, 'utf8').split('\n')
    for (const issue of staticRuntimePdfLibImports(lines)) {
      issues.push({ ...issue, file })
    }

    for (const check of RUNTIME_IMPORT_CHECKS) {
      for (const [index, text] of lines.entries()) {
        if (!check.pattern.test(text)) continue
        issues.push({
          check: check.name,
          file,
          line: index + 1,
          text: text.trim(),
          reason: check.reason,
        })
      }
    }
  }

  return issues
}

/**
 * Formats boundary violations for human-readable CI output.
 */
export function formatPdfRuntimeBoundaryIssues(issues) {
  if (issues.length === 0) {
    return 'PDF runtime boundaries OK.'
  }

  return [
    `${issues.length} PDF runtime boundary issue(s):`,
    ...issues.map(
      (issue) =>
        `- ${issue.file}:${issue.line} [${issue.check}] ${issue.reason}\n  ${issue.text}`,
    ),
  ].join('\n')
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false

if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const issues = findPdfRuntimeBoundaryIssues({ root })
  const output = formatPdfRuntimeBoundaryIssues(issues)
  if (issues.length > 0) {
    console.error(output)
    process.exit(1)
  }
  console.log(output)
}
