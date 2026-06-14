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
import { chunkBaseName, classifyBundleEntry } from './bundle-budget.mjs'

// Budgets en KB (gzip). Ajustables, pero pedí justificación.
const BUDGETS = {
  // +14 KB por @clerk/react v6 (auth UI + ClerkProvider). Carga condicional
  // según VITE_CLERK_PUBLISHABLE_KEY; sin esa var sigue siendo ~50 KB.
  'vendor-react': 70,
  'vendor-query': 25,
  'vendor-graph': 50,
  browser: 15,
  // Imprenta/PDF: chunks lazy pesados. No impactan el inicio, pero sí pueden
  // crecer sin ruido si entran nuevas dependencias de edición/export.
  PdfStudioView: 70,
  pdf: 140,
  'jspdf.es.min': 135,
  'html2canvas.esm': 55,
  'vendor-pdf-lib': 575,
  // Rutas principales lazy: mantenerlas con headroom chico evita que una vista
  // arrastre dependencias pesadas sin aparecer en el bundle inicial.
  ChatView: 10,
  CommandPalette: 8,
  EntitiesWorkbench: 14,
  GraphView: 18,
  ListeningView: 10,
  MomentosView: 25,
  QuotesView: 16,
  // Mundo Notas completo (lazy desde App): feed unificado notas+recortes con su
  // triage (RecorteCard + PromoteModal), calendario de actividad y NoteCard.
  // Salió del bundle `index` al hacerse lazy; vive en su propio chunk.
  NotasWorld: 42,
  Settings: 18,
  'index.es': 60,
  'purify.es': 12,
  // Bundle principal — el que más crece con features. Headroom mínimo.
  index: 110,
}

const DIST = 'dist/assets'
const MAX_UNBUDGETED_KB = 10
const reportOnly = process.argv.includes('--report')

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
  const base = chunkBaseName(file, Object.keys(BUDGETS))
  const budget = BUDGETS[base]
  const entry = classifyBundleEntry({
    base,
    budget,
    gzKb,
    maxUnbudgetedKb: MAX_UNBUDGETED_KB,
  })

  if (entry.status === 'missing-budget' || entry.status === 'over-budget') {
    failures.push(entry)
  } else {
    passes.push(entry)
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
  const label = f.status === 'missing-budget' ? 'SIN budget >' : 'EXCEDE budget'
  console.log(
    `  ${f.file.padEnd(20)} ${String(f.gzKb).padStart(4)} KB   ❌ ${label} ${f.budget} KB`,
  )
}
console.log('─'.repeat(50))

if (failures.length > 0 && !reportOnly) {
  console.error(
    `\n${failures.length} chunk(s) exceden su budget o necesitan budget explícito.\n` +
      `Entendé por qué crecieron antes de tocar scripts/check-bundle-size.mjs.\n`,
  )
  process.exit(1)
}

console.log('\n✅ Todos los chunks dentro del budget.\n')
