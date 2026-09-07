#!/usr/bin/env node
/**
 * Grafo de chunks del build: ningún ciclo entre chunks.
 *
 * POR QUÉ EXISTE
 *
 * Producción quedó en blanco con `TypeError: t is not a function` dentro de
 * `vendor-query`. `@clerk/react` había caído en `vendor-react` (su ruta
 * contiene `/react/`), `vendor-react` importaba `vendor-query` (query-core,
 * vía `@clerk/shared`) y `vendor-query` importaba `vendor-react` (React).
 * En un ciclo de módulos ES, el segundo en evaluarse ve los `var` del primero
 * todavía sin asignar; react-query llamó al init CommonJS de React y no era
 * función. `check-bundle-size` mide bytes, no el grafo, y el CI estaba verde.
 *
 * QUÉ HACE
 *
 * Lee `dist/assets/*.js`, saca los `import ... from "./x.js"` estáticos de la
 * cabecera de cada chunk y busca ciclos. Los `import()` dinámicos no cuentan:
 * no participan en el orden de evaluación inicial.
 *
 * USO: node scripts/check-chunk-graph.mjs [dist/assets]
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const STATIC_IMPORT_RE =
  /(?:^|[;}])\s*import\s*(?:[^'"()]*?from\s*)?["']\.\/([^"']+\.js)["']/g

/** Nombre lógico del chunk (`vendor-react-CuzF0Znx.js` → `vendor-react`). */
export function chunkName(file) {
  return file.replace(/-[A-Za-z0-9_-]{8}\.js$/, '')
}

/** Imports estáticos de un chunk (archivos), leídos de su cabecera. */
export function staticImports(source) {
  // Los imports van al principio; con 64 KB de cabecera sobra y no se
  // recorre un chunk de 1 MB entero. `import(` dinámico no matchea el
  // patrón: exige `from` o un import de efectos (`import "./x.js"`).
  const head = source.slice(0, 65536)
  const out = new Set()
  for (const match of head.matchAll(STATIC_IMPORT_RE)) out.add(match[1])
  return [...out]
}

export function buildChunkGraph(dir) {
  const graph = new Map()
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.js')) continue
    const source = readFileSync(join(dir, file), 'utf8')
    graph.set(file, staticImports(source))
  }
  return graph
}

/** Devuelve un ciclo (lista de archivos, cerrada) o null si el grafo es acíclico. */
export function findCycle(graph) {
  const WHITE = 0
  const GREY = 1
  const BLACK = 2
  const color = new Map([...graph.keys()].map((k) => [k, WHITE]))
  const stack = []
  function visit(node) {
    color.set(node, GREY)
    stack.push(node)
    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) continue
      const c = color.get(next)
      if (c === GREY) return [...stack.slice(stack.indexOf(next)), next]
      if (c === WHITE) {
        const found = visit(next)
        if (found) return found
      }
    }
    stack.pop()
    color.set(node, BLACK)
    return null
  }
  for (const node of graph.keys()) {
    if (color.get(node) === WHITE) {
      const found = visit(node)
      if (found) return found
    }
  }
  return null
}

function main() {
  const dir = resolve(process.argv[2] ?? 'dist/assets')
  const graph = buildChunkGraph(dir)
  if (graph.size === 0) {
    console.error(`No hay chunks en ${dir}. ¿Corriste \`npm run build\`?`)
    process.exitCode = 1
    return
  }
  const cycle = findCycle(graph)
  if (!cycle) {
    console.log(`chunk graph ok: ${graph.size} chunks, sin ciclos de import estático.`)
    return
  }
  console.error(
    'Ciclo de imports estáticos entre chunks (el segundo en evaluarse ve los `var` del primero sin asignar):\n  ' +
      cycle.map(chunkName).join(' → ') +
      '\nRevisá los grupos de scripts/vite-manual-chunks.ts: algún grupo captura un módulo que depende de otro grupo que a su vez depende de él.',
  )
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
