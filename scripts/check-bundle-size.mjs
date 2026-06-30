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
import {
  chunkBaseName,
  classifyBundleEntry,
  evaluateDuplicateBudgets,
  summarizeBundleEntries,
} from './bundle-budget.mjs'
import { PDF_AGGREGATE_BUDGETS } from './pdf-bundle-families.mjs'

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
  // +2 KB: shell lazy de Firma/Timbre Studio; el menú y persistencia viven en
  // StampAssetMenuHost, chunk separado, para no cargar toda la biblioteca upfront.
  PdfStudioView: 72,
  'pdf.worker.min': 380,
  'vendor-pdfjs': 140,
  'jspdf.es.min': 135,
  'html2canvas.esm': 55,
  'vendor-pdf-lib': 575,
  'vendor-ocr': 55,
  // Visor de Office de la Biblioteca: chunks lazy de mammoth (.docx → HTML) y
  // xlsx/SheetJS (.xlsx/.xls → HTML). Solo se bajan al abrir un documento Office
  // desde el visor (import dinámico en BibliotecaOfficeViewer); NO entran al
  // bundle inicial. Medidos ~131 / ~143 KB gzip; headroom chico.
  'vendor-mammoth': 140,
  'vendor-xlsx': 155,
  // Rutas principales lazy: mantenerlas con headroom chico evita que una vista
  // arrastre dependencias pesadas sin aparecer en el bundle inicial.
  ChatView: 10,
  CommandPalette: 8,
  EntitiesWorkbench: 14,
  GraphView: 18,
  ListeningView: 10,
  MomentosView: 25,
  QuotesView: 16,
  // Mundo Notas base (lazy desde App): chrome, inicio y secciones livianas.
  // El feed pesado se carga por sección como NotasFeedView.
  NotasWorld: 25,
  // Feed unificado notas+recortes: triage (RecorteCard + PromoteModal),
  // calendario de actividad, NoteCard y captura de adjuntos.
  NotasFeedView: 28,
  // Vista Biblioteca (lazy desde el mundo Notas): lista/grilla + visor con
  // inspector (etiquetas + conexiones + picker de entidad/nota/momento). Los
  // sub-visores PDF/texto y pdf.js viven en sus propios chunks.
  BibliotecaView: 16,
  Settings: 18,
  'index.es': 60,
  'purify.es': 12,
  // Bundle principal — el que más crece con features. Headroom mínimo.
  index: 110,
}

const AGGREGATE_BUDGETS = [...PDF_AGGREGATE_BUDGETS]
const DUPLICATE_BUDGETS = {
  'vendor-pdf-lib': { maxCount: 4, maxGzKb: 1500 },
  'vendor-pdfjs': { maxCount: 2, maxGzKb: 250 },
  'vendor-ocr': { maxCount: 2, maxGzKb: 15 },
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

const files = readdirSync(DIST).filter((f) => /\.(?:js|mjs)$/.test(f))
if (files.length === 0) {
  console.error('No hay .js/.mjs en dist/assets — build incompleto.')
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

const summary = summarizeBundleEntries([...passes, ...failures], AGGREGATE_BUDGETS)
for (const family of summary.families) {
  if (family.status === 'over-budget') {
    failures.push({
      file: family.name,
      gzKb: family.gzKb,
      budget: family.budget,
      status: 'over-budget',
    })
  }
}
const duplicateFailures = evaluateDuplicateBudgets(summary.duplicates, DUPLICATE_BUDGETS)
for (const duplicate of duplicateFailures) {
  failures.push({
    file: `${duplicate.file} duplicates`,
    gzKb: duplicate.gzKb,
    budget: duplicate.maxGzKb,
    status: 'duplicate-over-budget',
    count: duplicate.count,
    maxCount: duplicate.maxCount,
  })
}

// Tabla resumen.
console.log('\nBundle size report (gzip):')
console.log('─'.repeat(50))
for (const p of passes) {
  const tag = p.status === 'no-budget' ? '   (sin budget)' : `   (budget: ${p.budget} KB)`
  console.log(`  ${p.file.padEnd(20)} ${String(p.gzKb).padStart(4)} KB${tag}`)
}
for (const f of failures) {
  const label =
    f.status === 'missing-budget'
      ? 'SIN budget >'
      : f.status === 'duplicate-over-budget'
        ? `DUPLICADO x${f.count}/${f.maxCount} >`
        : 'EXCEDE budget'
  console.log(
    `  ${f.file.padEnd(20)} ${String(f.gzKb).padStart(4)} KB   ❌ ${label} ${f.budget} KB`,
  )
}
console.log('─'.repeat(50))

console.log('\nFamilias principales:')
for (const family of summary.families) {
  const marker = family.status === 'over-budget' ? ' ❌' : ''
  console.log(
    `  ${family.name.padEnd(24)} ${String(family.gzKb).padStart(4)} KB   (budget: ${family.budget} KB)${marker}`,
  )
  for (const offender of family.offenders) {
    console.log(
      `    - ${offender.file.padEnd(20)} ${String(offender.gzKb).padStart(4)} KB`,
    )
  }
}

if (summary.duplicates.length > 0) {
  console.log('\nDuplicaciones por nombre base:')
  for (const duplicate of summary.duplicates.slice(0, 8)) {
    console.log(
      `  ${duplicate.file.padEnd(20)} x${duplicate.count}   ${String(duplicate.gzKb).padStart(4)} KB total`,
    )
  }
}

console.log('\nTop offenders:')
for (const entry of [...passes, ...failures]
  .filter((entry) => !AGGREGATE_BUDGETS.some((family) => family.name === entry.file))
  .sort((a, b) => b.gzKb - a.gzKb || a.file.localeCompare(b.file))
  .slice(0, 10)) {
  console.log(`  ${entry.file.padEnd(20)} ${String(entry.gzKb).padStart(4)} KB`)
}

if (failures.length > 0 && !reportOnly) {
  console.error(
    `\n${failures.length} chunk(s) exceden su budget o necesitan budget explícito.\n` +
      `Entendé por qué crecieron antes de tocar scripts/check-bundle-size.mjs.\n`,
  )
  process.exit(1)
}

if (failures.length > 0) {
  console.log('\nReporte generado en modo solo lectura; hay budgets excedidos.\n')
} else {
  console.log('\n✅ Todos los chunks dentro del budget.\n')
}
