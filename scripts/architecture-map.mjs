#!/usr/bin/env node

/**
 * Gate del MAPA DE ARQUITECTURA (`docs/arquitectura/mapa.json` + `mapa.html`).
 *
 * **El problema que resuelve.** `ARCHITECTURE.md` se declara "documento vivo"
 * y sin embargo describe un sistema de seis vistas y un solo mundo: nunca
 * nombra Imprenta, Biblioteca, WhatsApp, R2, Clerk ni los embeddings. Nada lo
 * detectó porque la prosa no se verifica. El mapa nuevo cita ~200 archivos
 * reales, así que puede verificarse: si una ruta citada desaparece, el mapa
 * está mintiendo y este gate lo dice en el PR que la borró.
 *
 * **Qué garantiza** (todo barato, sin red ni base de datos):
 *   1. El JSON es un grafo íntegro: ids únicos, capas conocidas, aristas y
 *      pasos de flujo que apuntan a nodos que existen, sin nodos sueltos.
 *   2. Cada archivo citado por un nodo o por un paso de flujo EXISTE.
 *   3. El diagrama sigue siendo legible: ninguna caja se solapa con otra.
 *   4. El HTML y el JSON no divergen — el HTML lleva el grafo embebido para
 *      poder abrirse sin servidor, y dos copias que nadie compara se separan.
 *   5. Las estadísticas de portada no son de otra era (banda de tolerancia).
 *
 * **Modos.**
 *   `node scripts/architecture-map.mjs`           valida (esto corre en CI)
 *   `node scripts/architecture-map.mjs --build`   reinyecta el JSON en el HTML
 *                                                 y refresca las estadísticas
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const MAP_JSON = 'docs/arquitectura/mapa.json'
export const MAP_HTML = 'docs/arquitectura/mapa.html'

/** Marcadores que delimitan el grafo embebido dentro del HTML. */
export const BEGIN = '/* mapa:inicio */'
export const END = '/* mapa:fin */'

/** Cuánto puede envejecer un contador de portada antes de ser una mentira.
 *  No es exactitud: un endpoint nuevo no debe romper el CI de quien lo agrega,
 *  pero un mapa que dice 103 cuando hay 140 sí describe otro sistema. */
export const STAT_TOLERANCE = 0.15

/* ------------------------------------------------------------------ *
 * Recuento en vivo de las estadísticas de portada
 * ------------------------------------------------------------------ */

function countFiles(dir, predicate, root) {
  const full = join(root, dir)
  if (!existsSync(full)) return 0
  return readdirSync(full, { withFileTypes: true }).filter(predicate).length
}

export function measureRepo(root = process.cwd()) {
  return {
    endpoints: countFiles(
      'netlify/functions',
      (e) => e.isFile() && e.name.endsWith('.mts'),
      root,
    ),
    migraciones: countFiles('netlify/database/migrations', (e) => e.isDirectory(), root),
    specsE2E: countFiles('e2e', (e) => e.isFile() && e.name.endsWith('.spec.ts'), root),
    scriptsOperacionales: countFiles(
      'scripts',
      (e) => e.isFile() && e.name.endsWith('.mjs') && !e.name.endsWith('.test.mjs'),
      root,
    ),
  }
}

/* ------------------------------------------------------------------ *
 * Validación (lógica pura: recibe los datos ya leídos)
 * ------------------------------------------------------------------ */

/**
 * @param map      el grafo parseado
 * @param embedded el grafo embebido en el HTML (o null si no se pudo extraer)
 * @param exists   (ruta) => bool — inyectable para poder testear sin tocar disco
 * @param measured contadores reales del repo
 */
export function findMapIssues({ map, embedded, exists, measured }) {
  const issues = []
  const add = (code, message) => issues.push({ code, message })

  if (!map || typeof map !== 'object') {
    add('mapa-ilegible', 'El mapa no es un objeto JSON válido.')
    return issues
  }
  for (const key of ['meta', 'nodes', 'edges', 'flows']) {
    if (!map[key]) add('mapa-incompleto', `Falta la clave "${key}" en el mapa.`)
  }
  if (
    !Array.isArray(map.nodes) ||
    !Array.isArray(map.edges) ||
    !Array.isArray(map.flows)
  ) {
    add('mapa-incompleto', 'nodes, edges y flows deben ser arreglos.')
    return issues
  }

  // 1. Integridad del grafo.
  const ids = new Set()
  for (const n of map.nodes) {
    if (ids.has(n.id)) add('nodo-duplicado', `Hay dos nodos con id "${n.id}".`)
    ids.add(n.id)
  }
  const layers = new Set((map.meta?.layers ?? []).map((l) => l.id))
  for (const n of map.nodes) {
    if (!layers.has(n.layer)) {
      add(
        'capa-desconocida',
        `El nodo "${n.id}" declara la capa "${n.layer}", que no existe en meta.layers.`,
      )
    }
  }
  const conectados = new Set()
  for (const e of map.edges) {
    if (!ids.has(e.from))
      add('arista-rota', `Arista con origen inexistente: "${e.from}" → "${e.to}".`)
    if (!ids.has(e.to))
      add('arista-rota', `Arista con destino inexistente: "${e.from}" → "${e.to}".`)
    conectados.add(e.from)
    conectados.add(e.to)
  }
  for (const n of map.nodes) {
    if (!conectados.has(n.id)) {
      add(
        'nodo-suelto',
        `El nodo "${n.id}" no tiene ninguna arista: o sobra, o falta la relación que lo conecta.`,
      )
    }
  }
  for (const f of map.flows) {
    if (!Array.isArray(f.steps) || f.steps.length === 0) {
      add('flujo-vacio', `El flujo "${f.id}" no tiene pasos.`)
      continue
    }
    for (const [i, s] of f.steps.entries()) {
      if (!ids.has(s.node)) {
        add(
          'paso-roto',
          `El paso ${i + 1} del flujo "${f.id}" apunta al nodo inexistente "${s.node}".`,
        )
      }
    }
  }

  // 2. Referencias vivas: el corazón anti-podredumbre.
  const refs = new Map()
  for (const n of map.nodes) {
    for (const f of n.files ?? []) {
      if (!refs.has(f)) refs.set(f, [])
      refs.get(f).push(`nodo "${n.id}"`)
    }
  }
  for (const fl of map.flows) {
    for (const [i, s] of (fl.steps ?? []).entries()) {
      if (!s.file) continue
      if (!refs.has(s.file)) refs.set(s.file, [])
      refs.get(s.file).push(`flujo "${fl.id}" paso ${i + 1}`)
    }
  }
  for (const [file, quienes] of refs) {
    if (!exists(file)) {
      add(
        'archivo-inexistente',
        `El mapa cita "${file}" pero ese archivo ya no existe (lo citan: ${quienes.join(', ')}).`,
      )
    }
  }

  // 3. El diagrama tiene que seguir siendo legible.
  for (let i = 0; i < map.nodes.length; i++) {
    for (let j = i + 1; j < map.nodes.length; j++) {
      const a = map.nodes[i]
      const b = map.nodes[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        add(
          'cajas-solapadas',
          `Los nodos "${a.id}" y "${b.id}" se dibujan encima uno del otro.`,
        )
      }
    }
  }

  // 4. El HTML no puede contar otra historia que el JSON.
  if (embedded === null) {
    add(
      'html-sin-marcadores',
      `No encontré el grafo embebido entre ${BEGIN} y ${END} en ${MAP_HTML}.`,
    )
  } else if (JSON.stringify(embedded) !== JSON.stringify(map)) {
    add(
      'html-desincronizado',
      `${MAP_HTML} lleva embebida una versión distinta de ${MAP_JSON}. Corré: npm run architecture-map:build`,
    )
  }

  // 5. Estadísticas de portada dentro de la banda.
  const declaradas = map.meta?.stats ?? {}
  for (const [key, real] of Object.entries(measured)) {
    const dicho = declaradas[key]
    if (typeof dicho !== 'number') {
      add('stat-faltante', `meta.stats.${key} no está declarada.`)
      continue
    }
    const margen = Math.max(3, Math.round(real * STAT_TOLERANCE))
    if (Math.abs(dicho - real) > margen) {
      add(
        'stat-obsoleta',
        `meta.stats.${key} dice ${dicho} y hoy hay ${real} (tolerancia ±${margen}). Corré: npm run architecture-map:build`,
      )
    }
  }

  return issues
}

/* ------------------------------------------------------------------ *
 * Lectura de artefactos
 * ------------------------------------------------------------------ */

export function extractEmbedded(html) {
  const i = html.indexOf(BEGIN)
  const j = html.indexOf(END)
  if (i === -1 || j === -1 || j < i) return null
  const block = html.slice(i + BEGIN.length, j).trim()
  const withoutAssign = block.replace(/^const\s+DATA\s*=\s*/, '').replace(/;$/, '')
  try {
    return JSON.parse(withoutAssign)
  } catch {
    return null
  }
}

function readArtifacts(root) {
  const jsonPath = resolve(root, MAP_JSON)
  const htmlPath = resolve(root, MAP_HTML)
  const map = JSON.parse(readFileSync(jsonPath, 'utf8'))
  const html = readFileSync(htmlPath, 'utf8')
  return { jsonPath, htmlPath, map, html }
}

/* ------------------------------------------------------------------ *
 * --build: reinyecta el grafo en el HTML y refresca la portada
 * ------------------------------------------------------------------ */

function currentCommit(root) {
  try {
    return execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
  } catch {
    return null
  }
}

function build(root) {
  const { jsonPath, htmlPath, map, html } = readArtifacts(root)

  Object.assign(map.meta.stats, measureRepo(root))
  const commit = currentCommit(root)
  if (commit) map.meta.commit = commit
  writeFileSync(jsonPath, JSON.stringify(map, null, 2) + '\n')

  const i = html.indexOf(BEGIN)
  const j = html.indexOf(END)
  if (i === -1 || j === -1) {
    console.error(`No encontré los marcadores ${BEGIN} / ${END} en ${MAP_HTML}.`)
    process.exit(1)
  }
  // `</` dentro de una cadena JSON cerraría el <script> que lo contiene.
  const payload = JSON.stringify(map, null, 2).replaceAll('</', '<\\/')
  const next =
    html.slice(0, i + BEGIN.length) +
    '\n      const DATA = ' +
    payload +
    ';\n      ' +
    html.slice(j)
  writeFileSync(htmlPath, next)

  console.log(
    `mapa reconstruido — ${map.nodes.length} nodos, ${map.edges.length} aristas, ${map.flows.length} flujos`,
  )
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function main() {
  const root = process.cwd()
  if (process.argv.includes('--build')) {
    build(root)
    return
  }

  const { map, html } = readArtifacts(root)
  const issues = findMapIssues({
    map,
    embedded: extractEmbedded(html),
    exists: (file) => existsSync(resolve(root, file)),
    measured: measureRepo(root),
  })

  if (issues.length > 0) {
    console.error('El mapa de arquitectura dejó de describir el repo:')
    for (const issue of issues) console.error(`  - [${issue.code}] ${issue.message}`)
    process.exit(1)
  }

  const refs = new Set([
    ...map.nodes.flatMap((n) => n.files ?? []),
    ...map.flows.flatMap((f) => f.steps.map((s) => s.file)),
  ])
  console.log(
    `mapa de arquitectura ok — ${map.nodes.length} nodos, ${map.edges.length} aristas, ` +
      `${map.flows.length} flujos, ${refs.size} rutas verificadas`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
