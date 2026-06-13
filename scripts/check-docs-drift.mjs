#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const checks = [
  {
    file: 'README.md',
    pattern: /npm run test:e2e/,
    message: 'README.md still documents npm run test:e2e; the script is npm run e2e.',
  },
  {
    file: 'docs/README.md',
    pattern: /Hoy es single-user por diseño/,
    message: 'docs/README.md still says Trama is single-user by design.',
  },
  {
    file: 'ARCHITECTURE.md',
    pattern: /A migrar a `xyflow` o `sigma\.js`|Migrar grafo a xyflow o sigma\.js/,
    message: 'ARCHITECTURE.md still describes sigma.js as a future graph migration.',
  },
  {
    file: 'docs/escala.md',
    pattern: /refactorizar GraphView para usar WebGL|Refactor WebGL del grafo/,
    message: 'docs/escala.md still describes WebGL graph rendering as future work.',
  },
]

function readProjectFile(root, file) {
  return readFileSync(join(root, file), 'utf8')
}

function countFunctionEndpoints(root) {
  return readdirSync(join(root, 'netlify/functions'), { withFileTypes: true }).filter(
    (entry) => entry.isFile() && entry.name.endsWith('.mts'),
  ).length
}

function checkDocumentedFunctionCount(root) {
  const readme = readProjectFile(root, 'README.md')
  const match = readme.match(/functions\/\s+#\s+(\d+)\s+endpoints `\.mts`/)
  if (!match) {
    return {
      file: 'README.md',
      message: 'README.md no longer exposes the documented Netlify endpoint count.',
    }
  }

  const documented = Number(match[1])
  const actual = countFunctionEndpoints(root)
  if (documented === actual) return null

  return {
    file: 'README.md',
    message: `README.md documents ${documented} Netlify endpoints, but netlify/functions has ${actual} \`.mts\` files.`,
  }
}

export function checkDocsDrift(root = process.cwd()) {
  const projectRoot = resolve(root)
  const failures = checks.filter(({ file, pattern }) =>
    pattern.test(readProjectFile(projectRoot, file)),
  )
  const functionCountFailure = checkDocumentedFunctionCount(projectRoot)
  if (functionCountFailure) failures.push(functionCountFailure)

  return { ok: failures.length === 0, failures }
}

function main() {
  const result = checkDocsDrift()

  if (!result.ok) {
    console.error('Documentation drift checks failed:')
    for (const failure of result.failures) console.error(`  - ${failure.message}`)
    process.exit(1)
  }

  console.log('docs drift ok')
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) main()
