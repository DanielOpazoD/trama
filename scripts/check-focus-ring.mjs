#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Gate RATCHET de la CONVENCIÓN DE FOCO.
//
// La app tiene UNA sola convención de foco, global, en src/index.css:
//   *:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px }
//   (salvia dentro de .pdf-studio)
// Cubre todo elemento enfocable por teclado. Por eso un componente NO debería
// pelear con esa convención. Hay dos formas de pelearla, y este gate cuenta
// ambas como "foco horneado":
//   1. DUPLICARLA: agregar un `focus-visible:ring-*` propio encima del outline
//      global → doble indicador (fue el bug que motivó la pasada B5 en IconButton).
//   2. SUPRIMIRLA: `focus:outline-none` / `focus-visible:outline-none` sin un
//      reemplazo visible → el control queda SIN indicador de foco (bug a11y).
//
// El gate cuenta las LÍNEAS de src con una utilidad `focus(-visible)?:(ring|outline)`
// horneada y congela el número: como design-tokens / modal-overlay /
// form-control-labels / icon-button, solo puede BAJAR. Quitar una utilidad de
// foco redundante (o sustituirla por la convención global) saca la línea del conteo.
//
// El baseline NO implica que las líneas restantes estén mal: hay overrides
// legítimos (anillos salvia deliberados en pdfStudio, wrappers con focus-within,
// contenedores con tabIndex={-1} de foco programático). Quedan congelados para
// revisarlos/bajarlos en pasadas siguientes; lo que el gate impide es que CREZCA
// el foco horneado sin que alguien lo decida.

export const FOCUS_RING_BASELINE = 27

// Líneas de foco horneado ACEPTADAS de forma permanente (override deliberado que
// no se va a quitar). Allowlist file:line con razón, como en los otros ratchets.
export const FOCUS_RING_EXEMPT = new Map([
  // Inputs de búsqueda envueltos en <label class="input-paper">: el recuadro
  // muestra el foco vía `.input-paper:focus-within` (index.css) y el input
  // suprime su propio outline para que el ring del recuadro sea el único
  // indicador (no doble). El `focus:outline-none` acá es correcto, no un bug.
  [
    'src/components/BibliotecaView.tsx:344',
    'input-paper wrapper muestra el foco vía :focus-within',
  ],
  [
    'src/components/biblioteca/BibliotecaLinkPicker.tsx:216',
    'input-paper wrapper muestra el foco vía :focus-within',
  ],
])

// `focus:` o `focus-visible:` seguido de una utilidad ring/outline (incluye
// outline-none, ring-2, ring-offset-*, outline-offset-*, etc.).
const FOCUS_RING_RE = /focus(?:-visible)?:(?:ring|outline)\b/

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, files)
    else files.push(path)
  }
  return files
}

function isScannedFile(file) {
  if (file.endsWith('.test.tsx') || file.endsWith('.test.ts')) return false
  if (file.endsWith('.d.ts')) return false
  return file.endsWith('.tsx') || file.endsWith('.ts')
}

export function collectFocusRings(root = process.cwd()) {
  const projectRoot = resolve(root)
  const srcRoot = join(projectRoot, 'src')
  const found = []

  for (const file of walk(srcRoot).filter(isScannedFile)) {
    const source = readFileSync(file, 'utf8')
    if (!FOCUS_RING_RE.test(source)) continue
    const lines = source.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (FOCUS_RING_RE.test(lines[i]))
        found.push({ file: relative(projectRoot, file), line: i + 1 })
    }
  }
  found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  return found
}

export function checkFocusRings({
  root = process.cwd(),
  baseline = FOCUS_RING_BASELINE,
  exempt = FOCUS_RING_EXEMPT,
} = {}) {
  const all = collectFocusRings(root)
  const offenders = all.filter((e) => !exempt.has(`${e.file}:${e.line}`))
  const staleExempt = [...exempt.keys()].filter(
    (key) => !all.some((e) => `${e.file}:${e.line}` === key),
  )
  const failures = []
  if (offenders.length > baseline)
    failures.push({ kind: 'increase', actual: offenders.length, baseline })
  if (staleExempt.length > 0) failures.push({ kind: 'staleExempt', files: staleExempt })
  return {
    ok: failures.length === 0,
    count: offenders.length,
    baseline,
    offenders,
    staleExempt,
    failures,
    dropped: offenders.length < baseline,
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isCli) {
  const result = checkFocusRings()
  console.log('\nFocus-ring convention ratchet:')
  console.log('-'.repeat(72))
  console.log(
    `  líneas con foco horneado (focus:ring/outline)  ${String(result.count).padStart(4)}/${result.baseline}`,
  )
  console.log('-'.repeat(72))
  if (!result.ok) {
    if (result.count > result.baseline) {
      console.error(
        '\nSubió el foco horneado. La app ya tiene un `*:focus-visible` global ' +
          '(src/index.css): no hornees un `focus-visible:ring-*` propio (doble ' +
          'indicador) ni suprimas el outline con `focus:outline-none` sin un ' +
          'reemplazo visible. Nuevos:',
      )
      for (const e of result.offenders.slice(0, 30))
        console.error(`  - ${e.file}:${e.line}`)
    }
    if (result.staleExempt.length > 0) {
      console.error(
        '\nEntradas EXEMPT que ya no aplican (removelas de FOCUS_RING_EXEMPT):',
      )
      for (const key of result.staleExempt) console.error(`  - ${key}`)
    }
    console.error('')
    process.exit(1)
  }
  if (result.dropped) {
    console.log(
      `\nBajaste el foco horneado a ${result.count} (baseline ${result.baseline}). ` +
        'Actualizá FOCUS_RING_BASELINE en scripts/check-focus-ring.mjs.',
    )
  }
  console.log('\nfocus-ring convention ratchet ok\n')
}
