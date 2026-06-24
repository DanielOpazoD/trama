#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createMarkerExemption } from './lib/exempt-marker.mjs'
import { scannedSourceFiles } from './lib/source-files.mjs'

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
// CUANDO un anillo SÍ está justificado (tarjetas/miniaturas redondeadas, controles
// sobre imagen, contenedores con overflow-hidden donde el outline no encaja), el
// estándar es el TOKEN `.focus-ring` / `.focus-ring-inset` (src/index.css), no un
// `focus-visible:ring-*` ad-hoc. El token usa el mismo color del outline global y
// se adapta a salvia dentro de .pdf-studio; las clases NO llevan prefijo `focus:`,
// así que no las cuenta este gate.
//
// El gate cuenta las LÍNEAS de src con una utilidad `focus(-visible)?:(ring|outline)`
// horneada y congela el número (baseline 0): como design-tokens / modal-overlay /
// form-control-labels / icon-button, solo puede BAJAR. Migrar al token (o caer en
// la convención global) saca la línea del conteo.
//
// EXENCIONES por MARCADOR INLINE (no por allowlist file:LÍNEA, que se rompe al
// mover líneas): una línea de foco horneado queda exenta si la línea inmediatamente
// anterior contiene `focus-ring-exempt: <razón>`. La justificación vive pegada al
// código y sobrevive a refactors. Las líneas exentas NO están mal — son casos donde
// el indicador NO es un anillo (lo muestra un wrapper con focus-within, un cambio de
// borde, o es un contenedor con tabIndex={-1} que no debe tener foco). Un marcador
// sin una línea de foco debajo (dangling) hace fallar el gate, para que se limpie.
//
// ALCANCE: el gate solo ve utilidades Tailwind `focus:`/`focus-visible:` en .ts/.tsx.
// El foco hecho con `style` inline + estado de React (p. ej. el glow del compositor
// de notas) o en archivos .css sueltos (p. ej. el mascota del login) NO lo cubre;
// la convención igual aplica ahí, pero no está enforced estáticamente.

export const FOCUS_RING_BASELINE = 0

// `focus:` o `focus-visible:` seguido de una utilidad ring/outline (incluye
// outline-none, ring-2, ring-offset-*, outline-offset-*, etc.).
const FOCUS_RING_RE = /focus(?:-visible)?:(?:ring|outline)\b/
// Exención por marcador inline `focus-ring-exempt: <razón>` (razón no vacía
// obligatoria; un marcador pelado no exime). Mecanismo compartido con la familia
// de gates por-línea (form-control-labels, icon-button) vía scripts/lib.
const EXEMPT = createMarkerExemption('focus-ring-exempt')

function eachSourceFile(root, cb) {
  const projectRoot = resolve(root)
  for (const file of scannedSourceFiles(root, { extensions: ['.tsx', '.ts'] })) {
    const source = readFileSync(file, 'utf8')
    cb(relative(projectRoot, file), source.split('\n'))
  }
}

// Devuelve TODA línea con foco horneado, marcando si está exenta (por el marcador
// inline en la propia línea o en la inmediatamente anterior) y con su razón.
export function collectFocusRings(root = process.cwd()) {
  const found = []
  eachSourceFile(root, (file, lines) => {
    for (let i = 0; i < lines.length; i++) {
      if (!FOCUS_RING_RE.test(lines[i])) continue
      const marker = EXEMPT.markerFor(lines, i + 1)
      found.push({
        file,
        line: i + 1,
        exempt: Boolean(marker),
        reason: marker ? EXEMPT.reasonFrom(marker) : '',
      })
    }
  })
  found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  return found
}

// Marcadores `focus-ring-exempt` que NO tienen una línea de foco horneado en la
// misma línea ni en la siguiente: quedaron colgando tras un refactor y hay que
// quitarlos (o el marcador está mal ubicado).
export function collectDanglingMarkers(root = process.cwd()) {
  const dangling = []
  eachSourceFile(root, (file, lines) => {
    const constructLines = new Set()
    for (let i = 0; i < lines.length; i++)
      if (FOCUS_RING_RE.test(lines[i])) constructLines.add(i + 1)
    for (const line of EXEMPT.danglingLines(lines, constructLines))
      dangling.push({ file, line })
  })
  return dangling
}

export function checkFocusRings({
  root = process.cwd(),
  baseline = FOCUS_RING_BASELINE,
} = {}) {
  const all = collectFocusRings(root)
  const offenders = all.filter((e) => !e.exempt)
  const dangling = collectDanglingMarkers(root)
  const failures = []
  if (offenders.length > baseline)
    failures.push({ kind: 'increase', actual: offenders.length, baseline })
  if (dangling.length > 0)
    failures.push({
      kind: 'danglingMarker',
      files: dangling.map((d) => `${d.file}:${d.line}`),
    })
  return {
    ok: failures.length === 0,
    count: offenders.length,
    baseline,
    offenders,
    exempt: all.filter((e) => e.exempt),
    dangling,
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
    `  foco horneado sin exención  ${String(result.count).padStart(4)}/${result.baseline}` +
      `   (exentas por marcador: ${result.exempt.length})`,
  )
  console.log('-'.repeat(72))
  if (!result.ok) {
    if (result.count > result.baseline) {
      console.error(
        '\nSubió el foco horneado. La app ya tiene un `*:focus-visible` global ' +
          '(src/index.css): no hornees un `focus-visible:ring-*` ad-hoc (doble ' +
          'indicador) ni suprimas el outline con `focus:outline-none` sin un ' +
          'reemplazo visible. Si el elemento NECESITA un anillo (tarjeta, ' +
          'miniatura, sobre imagen), usá el token `.focus-ring` / ' +
          '`.focus-ring-inset`. Si es un caso legítimo sin anillo, poné en la ' +
          'línea de arriba un comentario `focus-ring-exempt: <razón>`. Nuevos:',
      )
      for (const e of result.offenders.slice(0, 30))
        console.error(`  - ${e.file}:${e.line}`)
    }
    if (result.dangling.length > 0) {
      console.error(
        '\nMarcadores `focus-ring-exempt` sin foco horneado debajo (quitalos o ' +
          'reubicalos):',
      )
      for (const key of result.failures.find((f) => f.kind === 'danglingMarker').files)
        console.error(`  - ${key}`)
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
