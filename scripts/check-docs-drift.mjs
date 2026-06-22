#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs'
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

// Documentos cuyas rutas de archivo entre backticks se validan contra el árbol.
// Si un doc cita `src/api.ts` y ese archivo no existe (hoy es `src/api/`), falla.
const STRUCTURAL_DOCS = ['ARCHITECTURE.md', 'AGENTS.md']

// Top-level dirs reales del repo. Una ruta entre backticks que empiece con uno
// de estos (o termine en una extensión real con al menos un `/`) se considera
// "una ruta de archivo del repo" y debe existir.
const REPO_ROOTS = ['src/', 'netlify/', 'scripts/', 'docs/', '.github/']

// Extensiones de archivos que de verdad viven en el repo. Una ruta que termina
// en una de estas Y contiene un `/` se valida aunque no empiece en un REPO_ROOT
// (p.ej. `_lib/db.ts`).
const REAL_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.mjs',
  '.cjs',
  '.js',
  '.md',
  '.sql',
  '.css',
  '.json',
  '.yml',
  '.yaml',
  '.html',
]

function hasRealExtension(token) {
  return REAL_EXTENSIONS.some((ext) => token.endsWith(ext))
}

/**
 * ¿El token entre backticks apunta claramente a un archivo del repo?
 *
 * Conservador a propósito: el objetivo es atrapar rutas reales rotas
 * (`src/api.ts`) sin marcar ejemplos ilustrativos ni símbolos. Por eso solo
 * consideramos rutas "ancladas": empiezan en un dir top-level conocido, o
 * contienen un `/` y terminan en una extensión real. Un nombre suelto sin
 * carpeta (`foo.ts`, `App.tsx`, `byYear.ts`) es ambiguo y se ignora.
 */
function looksLikeRepoFilePath(token) {
  // Globs y placeholders ilustrativos: no son rutas concretas.
  if (token.includes('*') || token.includes('<') || token.includes('>')) return false
  // Paquetes npm (`@netlify/database`) y rutas HTTP de la API (`/api/...`,
  // `POST /api/...`): tienen `/` pero no son archivos del repo.
  if (token.startsWith('@') || token.startsWith('/') || token.includes(' ')) return false
  // Parámetros de ruta tipo `:id` delatan un endpoint, no un archivo.
  if (token.includes(':')) return false

  const anchoredAtRoot = REPO_ROOTS.some((root) => token.startsWith(root))
  if (anchoredAtRoot) return true

  // No anclado en un root: solo lo tratamos como ruta si tiene carpeta + ext
  // real (descarta `entity_types`, `getSql()`, etc.; descarta `App.tsx` por no
  // tener `/`).
  return token.includes('/') && hasRealExtension(token)
}

/**
 * Resuelve un token-ruta contra el árbol. Acepta variantes razonables para
 * rutas citadas sin su prefijo completo (`_lib/db.ts` vive bajo
 * `netlify/functions/`).
 */
function repoPathExists(root, token) {
  const candidates = [token]
  if (token.startsWith('_lib/')) {
    candidates.push(join('netlify/functions', token))
  }
  return candidates.some((candidate) => existsSync(join(root, candidate)))
}

function extractBacktickTokens(content) {
  const tokens = []
  const regex = /`([^`\n]+)`/g
  let match
  while ((match = regex.exec(content)) !== null) {
    tokens.push(match[1].trim())
  }
  return tokens
}

function checkStructuralFilePaths(root) {
  const failures = []
  for (const doc of STRUCTURAL_DOCS) {
    if (!existsSync(join(root, doc))) continue
    const content = readFileSync(join(root, doc), 'utf8')
    const seen = new Set()
    for (const token of extractBacktickTokens(content)) {
      if (seen.has(token)) continue
      seen.add(token)
      if (!looksLikeRepoFilePath(token)) continue
      if (repoPathExists(root, token)) continue
      failures.push({
        file: doc,
        message: `${doc} cites \`${token}\`, but that path does not exist in the repo tree.`,
      })
    }
  }
  return failures
}

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
  failures.push(...checkStructuralFilePaths(projectRoot))

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
