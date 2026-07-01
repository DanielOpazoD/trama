#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { listFilesRecursive } from './lib/source-files.mjs'

const SOURCE_DIRS = ['src']
const PDF_RUNTIME_SPECIFIERS = new Set([
  'pdf-lib',
  '@pdf-lib/fontkit',
  'pdfjs-dist',
  'pdfjs-dist/build/pdf.worker.min.mjs?url',
])
const PDF_LOADER_RE =
  /pdfRuntime\/(?:pdfLibLoader|pdfjsLoader)|pdfRuntime\\(?:pdfLibLoader|pdfjsLoader)/
const PDF_LOADER_FILES = new Set([
  'src/lib/pdfStudio/pdfRuntime/pdfLibLoader.ts',
  'src/lib/pdfStudio/pdfRuntime/pdfjsLoader.ts',
])

function isSourceFile(file) {
  if (/\.d\.(?:ts|mts)$/.test(file)) return false
  return /\.(?:ts|tsx|mts|mjs)$/.test(file)
}

function isTestFile(file) {
  return /(?:^|[./])(?:[^/]+\.test|__tests__)[./]/.test(file) || file.includes('.test.')
}

function importKind({ file, specifier, typeOnly }) {
  if (PDF_LOADER_RE.test(specifier)) return 'loader-consumer'
  if (!PDF_RUNTIME_SPECIFIERS.has(specifier)) return null
  if (isTestFile(file)) return 'test-runtime'
  if (typeOnly) return 'type-only'
  if (PDF_LOADER_FILES.has(file)) return 'loader-runtime'
  return 'direct-runtime'
}

function recordImport({ imports, file, line, text, specifier, typeOnly = false }) {
  const kind = importKind({ file, specifier, typeOnly })
  if (!kind) return
  imports.push({
    file,
    kind,
    line,
    specifier,
    text: text.trim(),
  })
}

function collectStaticImports({ imports, file, lines }) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trimStart()
    if (!trimmed.startsWith('import ')) continue

    const block = [line]
    while (
      index + 1 < lines.length &&
      !/\sfrom\s+['"][^'"]+['"]/.test(block.join('\n')) &&
      !/import\s+['"][^'"]+['"]/.test(block.join('\n'))
    ) {
      index += 1
      block.push(lines[index])
    }

    const joined = block.join('\n')
    const typeOnly = joined.trimStart().startsWith('import type ')
    const fromMatch = joined.match(/\sfrom\s+['"]([^'"]+)['"]/)
    const sideEffectMatch = joined.match(/^import\s+['"]([^'"]+)['"]/m)
    const specifier = fromMatch?.[1] ?? sideEffectMatch?.[1]
    if (!specifier) continue
    recordImport({
      imports,
      file,
      line: index + 1 - block.length + 1,
      specifier,
      text: joined,
      typeOnly,
    })
  }
}

function collectDynamicImports({ imports, file, lines }) {
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(
      /(?:import|vi\.mock|vi\.doMock)\(\s*['"]([^'"]+)['"]/g,
    )) {
      recordImport({
        imports,
        file,
        line: index + 1,
        specifier: match[1],
        text: line,
      })
    }
  }
}

function sourceFiles(root) {
  return SOURCE_DIRS.flatMap((dir) => {
    const abs = join(root, dir)
    if (!existsSync(abs)) return []
    return listFilesRecursive(abs).filter(isSourceFile)
  })
}

export function collectPdfRuntimeInventory({ root = process.cwd() } = {}) {
  const resolvedRoot = resolve(root)
  const imports = []

  for (const path of sourceFiles(resolvedRoot)) {
    const file = relative(resolvedRoot, path)
    const lines = readFileSync(path, 'utf8').split('\n')
    collectStaticImports({ imports, file, lines })
    collectDynamicImports({ imports, file, lines })
  }

  imports.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  return { imports }
}

export function summarizePdfRuntimeInventory(inventory) {
  return {
    directRuntime: inventory.imports.filter((entry) => entry.kind === 'direct-runtime')
      .length,
    loaderRuntime: inventory.imports.filter((entry) => entry.kind === 'loader-runtime')
      .length,
    loaderConsumers: inventory.imports.filter((entry) => entry.kind === 'loader-consumer')
      .length,
    testRuntime: inventory.imports.filter((entry) => entry.kind === 'test-runtime')
      .length,
    typeOnly: inventory.imports.filter((entry) => entry.kind === 'type-only').length,
  }
}

export function formatPdfRuntimeInventory(inventory) {
  const summary = summarizePdfRuntimeInventory(inventory)
  const lines = [
    'PDF runtime inventory:',
    `  loader runtime imports: ${summary.loaderRuntime}`,
    `  loader consumers:       ${summary.loaderConsumers}`,
    `  direct runtime imports: ${summary.directRuntime}`,
    `  type-only imports:      ${summary.typeOnly}`,
    `  test/runtime mocks:     ${summary.testRuntime}`,
  ]

  const direct = inventory.imports.filter((entry) => entry.kind === 'direct-runtime')
  if (direct.length > 0) {
    lines.push('', 'Direct runtime imports:')
    for (const entry of direct) {
      lines.push(`  - ${entry.file}:${entry.line} ${entry.specifier}`)
    }
  }

  return lines.join('\n')
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false

if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  console.log(formatPdfRuntimeInventory(collectPdfRuntimeInventory({ root })))
}
