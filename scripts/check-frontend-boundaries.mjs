#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const importFromRe = /^\s*import\s+(type\s+)?[\s\S]*?\s+from\s+['"]([^'"]+)['"]/gm
const sideEffectImportRe = /^\s*import\s+['"]([^'"]+)['"]/gm

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path, files)
    else files.push(path)
  }
  return files
}

function isComponentViewModel(file) {
  return /[Vv]iewModel\.ts$/.test(file)
}

function classifyForbiddenImport(specifier, typeOnly) {
  if (specifier === 'react' || specifier.startsWith('react/')) {
    return `imports ${specifier}; component view models must stay pure.`
  }
  if (/\/state$|\/state\//.test(specifier) || specifier === '../state') {
    return `imports ${specifier}; component view models must not consume app state.`
  }
  if (!typeOnly && (/\/api$|\/api\//.test(specifier) || specifier === '../api')) {
    return `imports ${specifier}; component view models may only use API contracts via import type.`
  }
  return null
}

function readStaticImports(source) {
  const imports = []
  for (const match of source.matchAll(importFromRe)) {
    imports.push({ typeOnly: Boolean(match[1]), specifier: match[2] })
  }
  for (const match of source.matchAll(sideEffectImportRe)) {
    imports.push({ typeOnly: false, specifier: match[1] })
  }
  return imports
}

export function checkFrontendBoundaries(root = process.cwd()) {
  const projectRoot = resolve(root)
  const componentsRoot = join(projectRoot, 'src/components')
  const failures = []

  for (const file of walk(componentsRoot).filter(isComponentViewModel)) {
    const rel = relative(projectRoot, file)
    const source = readFileSync(file, 'utf8')
    for (const { typeOnly, specifier } of readStaticImports(source)) {
      const message = classifyForbiddenImport(specifier, typeOnly)
      if (message) failures.push({ file: rel, message: `${rel} ${message}` })
    }
  }

  return { ok: failures.length === 0, failures }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkFrontendBoundaries()
  if (!result.ok) {
    console.error('Frontend boundary checks failed:')
    for (const failure of result.failures) console.error(`  - ${failure.message}`)
    process.exit(1)
  }
  console.log('frontend boundaries ok')
}
