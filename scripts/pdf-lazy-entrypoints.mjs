#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, normalize, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { chunkBaseName } from './bundle-budget.mjs'
import { PDF_LAZY_ENTRYPOINT_BASES } from './pdf-entrypoint-inventory.mjs'

const ENTRY_REF_RE = /<(script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["'][^>]*>/gi
const STATIC_IMPORT_RE =
  /\b(?:import\s+(?!\()[\s\S]*?\s+from\s*|import\s*|export\s+[\s\S]*?\s+from\s*)["']([^"']+)["']/g
const PDF_STUDIO_SHELL = 'src/components/notas/pdfStudio/PdfStudioView.tsx'
const STATIC_TEXT_EDITOR_IMPORT_RE =
  /^\s*import\s+(?!type\b)[\s\S]*?\s+from\s+['"]\.\/editor\/PdfTextEditor['"]/gm

function isPdfEntrypointAsset(asset) {
  const base = chunkBaseName(basename(asset), PDF_LAZY_ENTRYPOINT_BASES)
  return PDF_LAZY_ENTRYPOINT_BASES.includes(base)
}

function assetPathFromRef(ref) {
  if (!ref.startsWith('/assets/') && !ref.startsWith('assets/')) return null
  return ref.replace(/^\/?assets\//, 'assets/')
}

function extractInitialAssetRefs(indexHtml) {
  const refs = []
  let match
  ENTRY_REF_RE.lastIndex = 0
  while ((match = ENTRY_REF_RE.exec(indexHtml)) !== null) {
    const tag = match[1]
    const fullTag = match[0]
    const ref = assetPathFromRef(match[2])
    if (!ref || !/\.(?:js|mjs)$/.test(ref)) continue
    if (tag === 'script' && /\btype=["']module["']/.test(fullTag)) refs.push(ref)
    if (tag === 'link' && /\brel=["']modulepreload["']/.test(fullTag)) refs.push(ref)
  }
  return [...new Set(refs)]
}

function extractStaticImports(contents) {
  const refs = []
  let match
  STATIC_IMPORT_RE.lastIndex = 0
  while ((match = STATIC_IMPORT_RE.exec(contents)) !== null) {
    refs.push(match[1])
  }
  return refs
}

function resolveAssetImport(fromAsset, importee) {
  if (!importee.startsWith('./') && !importee.startsWith('../')) return null
  const resolved = normalize(join(dirname(fromAsset), importee))
  if (!resolved.startsWith('assets/')) return null
  if (!/\.(?:js|mjs)$/.test(resolved)) return null
  return resolved
}

function lineForOffset(contents, offset) {
  return contents.slice(0, offset).split('\n').length
}

export { PDF_LAZY_ENTRYPOINT_BASES }

export function findPdfStudioSourceLazyIssues({ root = process.cwd() } = {}) {
  const shellPath = join(resolve(root), PDF_STUDIO_SHELL)
  if (!existsSync(shellPath)) return []

  const contents = readFileSync(shellPath, 'utf8')
  const issues = []
  STATIC_TEXT_EDITOR_IMPORT_RE.lastIndex = 0
  let match
  while ((match = STATIC_TEXT_EDITOR_IMPORT_RE.exec(contents)) !== null) {
    issues.push({
      check: 'pdf-studio-editor-lazy-shell',
      file: PDF_STUDIO_SHELL,
      line: lineForOffset(contents, match.index),
      reason: 'PdfTextEditor debe cargarse con React.lazy desde el shell PDF.',
      text: match[0].trim(),
    })
  }
  return issues
}

/**
 * Finds PDF runtime chunks that accidentally became part of the initial route.
 * Dynamic imports are allowed: PDF Studio may stay lazy behind user intent.
 */
export function findPdfLazyEntrypointIssues(distRoot = 'dist') {
  const indexPath = join(distRoot, 'index.html')
  if (!existsSync(indexPath)) {
    return [
      {
        asset: 'index.html',
        kind: 'missing-index',
        reason: 'dist/index.html is required before checking PDF lazy entrypoints',
      },
    ]
  }

  const issues = []
  const indexHtml = readFileSync(indexPath, 'utf8')
  const initialAssets = extractInitialAssetRefs(indexHtml)
  const queue = [...initialAssets]
  const visited = new Set()

  for (const asset of initialAssets) {
    if (!isPdfEntrypointAsset(asset)) continue
    issues.push({
      asset: basename(asset),
      kind: 'initial-pdf-asset',
      reason: 'PDF chunk is referenced directly by dist/index.html',
    })
  }

  while (queue.length > 0) {
    const asset = queue.shift()
    if (!asset || visited.has(asset)) continue
    visited.add(asset)

    const assetPath = join(distRoot, asset)
    if (!existsSync(assetPath)) {
      issues.push({
        asset: basename(asset),
        kind: 'missing-initial-asset',
        reason: 'Initial asset referenced by dist/index.html was not found',
      })
      continue
    }

    const contents = readFileSync(assetPath, 'utf8')
    for (const importRef of extractStaticImports(contents)) {
      const importee = resolveAssetImport(asset, importRef)
      if (!importee) continue
      if (isPdfEntrypointAsset(importee)) {
        issues.push({
          asset: basename(asset),
          importee: basename(importee),
          kind: 'initial-static-pdf-import',
          reason: 'Initial entry chunk statically imports a PDF runtime chunk',
        })
        continue
      }
      queue.push(importee)
    }
  }

  return issues
}

export function formatPdfLazyEntrypointIssues(issues) {
  return issues
    .map((issue) => {
      if (issue.file && issue.line) {
        return `- ${issue.file}:${issue.line} [${issue.check}] ${issue.reason}\n  ${issue.text}`
      }
      if (issue.importee) {
        return `- ${issue.kind}: ${issue.asset} -> ${issue.importee}. ${issue.reason}`
      }
      return `- ${issue.kind}: ${issue.asset}. ${issue.reason}`
    })
    .join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const distRoot = process.argv[2] ?? 'dist'
  const issues = [
    ...findPdfStudioSourceLazyIssues(),
    ...findPdfLazyEntrypointIssues(distRoot),
  ]
  if (issues.length > 0) {
    console.error(
      `PDF lazy entrypoint contract failed for ${relative(process.cwd(), distRoot)}:\n` +
        formatPdfLazyEntrypointIssues(issues),
    )
    process.exit(1)
  }
  console.log('PDF lazy entrypoint contract OK.')
}
