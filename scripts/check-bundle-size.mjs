#!/usr/bin/env node
/**
 * G4: bundle-size budget check.
 *
 * Falla si un chunk del build crece más de su budget. Pensado para correr
 * en CI después de `npm run build` para frenar regresiones silenciosas
 * (hoy el bundle creció ~15KB entre EE y FF sin que nadie se enterara).
 *
 * Los budgets están en KB gzip — la métrica que el browser ve al descargar.
 * Si actualizás un chunk arriba del budget, primero entendé por qué creció
 * y solo después subí el budget. NO subas el budget para "que pase CI" — es
 * un termómetro de drift.
 *
 * Si querés ver los tamaños reales sin fallar, corré con `--report`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

// Budgets en KB (gzip). Ajustables, pero pedí justificación.
const BUDGETS = {
  // +14 KB por @clerk/react v6 (auth UI + ClerkProvider). Carga condicional
  // según VITE_CLERK_PUBLISHABLE_KEY; sin esa var sigue siendo ~50 KB.
  'vendor-react': 70,
  'vendor-query': 25,
  'vendor-graph': 50,
  browser: 15,
  // Bundle principal — el que más crece con features. Headroom mínimo.
  index: 110,
}

const DIST = 'dist/assets'
const reportOnly = process.argv.includes('--report')

function chunkBaseName(file) {
  // index-AB12cd.js → index, vendor-react-XY.js → vendor-react
  //
  // Vite emite el hash con caracteres base64-url-safe que pueden incluir
  // dashes internos y trailing dash (e.g. `index-DZkgaF-k.js`,
  // `MomentosView-D9Z41wa-.js`). El truco es fijar el LARGO del hash:
  // Vite default es 8 chars, configurable [6..12]. Usamos greedy `.+`
  // que backtrackea hasta encontrar exactamente N chars hash al final.
  // Sin esto, hashes con dashes internos contaminaban el match.
  const m = file.match(/^(.+)-[A-Za-z0-9_-]{6,12}\.js$/)
  return m ? m[1] : file.replace(/\.js$/, '')
}

let stat
try {
  stat = statSync(DIST)
} catch {
  console.error(`No existe ${DIST}. Corré 'npm run build' primero.`)
  process.exit(1)
}
if (!stat.isDirectory()) {
  console.error(`${DIST} no es un directorio.`)
  process.exit(1)
}

const files = readdirSync(DIST).filter((f) => f.endsWith('.js'))
if (files.length === 0) {
  console.error('No hay .js en dist/assets — build incompleto.')
  process.exit(1)
}

const failures = []
const passes = []

for (const file of files) {
  const path = join(DIST, file)
  const buf = readFileSync(path)
  const gzKb = Math.round(gzipSync(buf).length / 1024)
  const base = chunkBaseName(file)
  const budget = BUDGETS[base]

  if (budget === undefined) {
    // Chunk sin budget — solo reportar.
    passes.push({ file: base, gzKb, status: 'no-budget' })
    continue
  }
  if (gzKb > budget) {
    failures.push({ file: base, gzKb, budget })
  } else {
    passes.push({ file: base, gzKb, budget, status: 'ok' })
  }
}

// Tabla resumen.
console.log('\nBundle size report (gzip):')
console.log('─'.repeat(50))
for (const p of passes) {
  const tag = p.status === 'no-budget' ? '   (sin budget)' : `   (budget: ${p.budget} KB)`
  console.log(`  ${p.file.padEnd(20)} ${String(p.gzKb).padStart(4)} KB${tag}`)
}
for (const f of failures) {
  console.log(
    `  ${f.file.padEnd(20)} ${String(f.gzKb).padStart(4)} KB   ❌ EXCEDE budget ${f.budget} KB`,
  )
}
console.log('─'.repeat(50))

if (failures.length > 0 && !reportOnly) {
  console.error(
    `\n${failures.length} chunk(s) exceden su budget.\n` +
      `Entendé por qué crecieron antes de subir el budget en scripts/check-bundle-size.mjs.\n`,
  )
  process.exit(1)
}

console.log('\n✅ Todos los chunks dentro del budget.\n')
