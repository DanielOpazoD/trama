#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createMarkerExemption } from './lib/exempt-marker.mjs'
import { scannedSourceFiles } from './lib/source-files.mjs'

// Gate RATCHET de nombres accesibles en controles de formulario.
//
// La auditoría marcó controles (`<input>`, `<textarea>`, `<select>`) sin nombre
// accesible: tienen `placeholder` pero ningún `<label>` asociado ni `aria-label`,
// así que un lector de pantalla los anuncia como "edit text" sin más. El
// placeholder NO cuenta como nombre (desaparece al escribir).
//
// Por qué un gate propio y no `jsx-a11y/control-has-associated-label`: esa regla
// mira SOLO desde el control y NO reconoce la asociación `<label htmlFor>` ↔
// `id`, así que marca como error los controles correctamente etiquetados con
// htmlFor (el patrón que queremos). Este gate sí cruza htmlFor/id dentro del
// archivo, de modo que el fix idiomático (label visible + htmlFor) no se penaliza.
//
// Es un RATCHET como design-tokens / modal-overlay: congelamos el conteo actual
// (FORM_CONTROL_LABEL_BASELINE) y solo permitimos BAJARLO. Cuando alguien
// etiqueta más controles, el conteo baja y el gate avisa para actualizar el piso.
//
// Un control cuenta como ETIQUETADO si su tag tiene cualquiera de:
//   - aria-label / aria-labelledby / title
//   - type="hidden" (los inputs ocultos no necesitan nombre)
//   - un id referenciado por algún htmlFor del MISMO archivo (label asociado)
// Si no, cuenta como SIN ETIQUETAR (deuda).
//
// EXENCIONES por MARCADOR INLINE (no por allowlist file:LÍNEA, que se rompe al
// mover líneas — mismo patrón que check:focus-ring): un control sin nombre queda
// exento si la línea inmediatamente anterior (o la misma) trae
// `form-control-label-exempt: <razón>`. Son los casos LEGÍTIMAMENTE nombrados por
// un <label> padre que los ENVUELVE (asociación nativa por anidamiento, que el
// escaneo plano no detecta): el nombre accesible viene del texto del <label> y
// agregar aria-label sería redundante y, si difiere del texto visible, violaría
// WCAG 2.5.3 (Label in Name). Como el control vive dentro del <label>, el marcador
// va en un comentario JSX `{/* … */}` sobre la línea del control. Un marcador sin
// un control sin nombre debajo (dangling) hace fallar el gate, para que se limpie.

export const FORM_CONTROL_LABEL_BASELINE = 0

const CONTROL_RE = /<(input|textarea|select)\b/g
// Captura el valor de htmlFor/id en sus cuatro formas: "x", 'x', {`x`}/{'x'} y
// {ident} (p. ej. id={useId()} guardado en una variable). Reconocer la forma
// {ident} evita falsos positivos en controles asociados dinámicamente.
const HTMLFOR_RE =
  /htmlFor=(?:"([^"]+)"|'([^']+)'|\{\s*[`'"]([^`'"]+)[`'"]\s*\}|\{\s*([A-Za-z_$][\w$.]*)\s*\})/g
const LABEL_ATTR_RE = /\b(aria-label|aria-labelledby|title)\b[=\s]/
const HIDDEN_RE = /type=(?:"hidden"|'hidden'|\{\s*[`'"]hidden[`'"]\s*\})/
const ID_RE =
  /\bid=(?:"([^"]+)"|'([^']+)'|\{\s*[`'"]([^`'"]+)[`'"]\s*\}|\{\s*([A-Za-z_$][\w$.]*)\s*\})/
// Exención por marcador inline `form-control-label-exempt: <razón>` (razón no
// vacía obligatoria; un marcador pelado no exime). Como el control vive dentro de
// su <label> padre, el marcador va en un comentario JSX `{/* … */}` sobre la línea
// del control. Mecanismo compartido con la familia por-línea (focus-ring,
// icon-button) vía scripts/lib.
const EXEMPT = createMarkerExemption('form-control-label-exempt')

// Extrae el tag completo desde `<` hasta el `>` de cierre a profundidad 0,
// respetando strings y `{...}` (los arrow handlers traen `>` dentro de llaves).
function extractTag(src, startIdx) {
  let depth = 0
  let inStr = null
  for (let i = startIdx; i < src.length; i++) {
    const c = src[i]
    if (inStr) {
      if (c === inStr) inStr = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') inStr = c
    else if (c === '{') depth += 1
    else if (c === '}') depth -= 1
    else if (c === '>' && depth === 0) return src.slice(startIdx, i + 1)
  }
  return src.slice(startIdx)
}

function collectHtmlForTargets(source) {
  const ids = new Set()
  for (const m of source.matchAll(HTMLFOR_RE)) ids.add(m[1] ?? m[2] ?? m[3] ?? m[4])
  return ids
}

function tagId(tag) {
  const m = tag.match(ID_RE)
  return m ? (m[1] ?? m[2] ?? m[3] ?? m[4]) : null
}

// Neutraliza comentarios de bloque (incluye los JSX `{/* … */}` y JSDoc) para
// que un `<textarea>` mencionado en prosa no cuente como control. Reemplaza solo
// los caracteres que no son saltos de línea, preservando offsets y números de
// línea del reporte. Los marcadores se buscan sobre el source CRUDO, así que el
// blanqueo del `{/* … */}` del propio marcador no lo oculta.
function stripBlockComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

function isLabeled(tag, htmlForTargets) {
  if (LABEL_ATTR_RE.test(tag)) return true
  if (HIDDEN_RE.test(tag)) return true
  const id = tagId(tag)
  return id != null && htmlForTargets.has(id)
}

// Líneas (1-based) de `stripped` con un control de formulario SIN nombre accesible.
function unlabeledControlLines(stripped) {
  if (!CONTROL_RE.test(stripped)) return []
  CONTROL_RE.lastIndex = 0
  const htmlForTargets = collectHtmlForTargets(stripped)
  const found = []
  for (const m of stripped.matchAll(CONTROL_RE)) {
    const tag = extractTag(stripped, m.index)
    if (isLabeled(tag, htmlForTargets)) continue
    found.push({ line: stripped.slice(0, m.index).split('\n').length, kind: m[1] })
  }
  return found
}

// Devuelve TODO control sin nombre accesible, marcando si está exento (por el
// marcador inline en su línea o en la inmediatamente anterior) y con su razón.
export function collectFormControlLabels(root = process.cwd()) {
  const projectRoot = resolve(root)
  const controls = []

  for (const file of scannedSourceFiles(root)) {
    const raw = readFileSync(file, 'utf8')
    const found = unlabeledControlLines(stripBlockComments(raw))
    if (found.length === 0) continue
    const rel = relative(projectRoot, file)
    const rawLines = raw.split('\n')
    for (const { line, kind } of found) {
      const marker = EXEMPT.markerFor(rawLines, line)
      controls.push({
        file: rel,
        line,
        kind,
        exempt: Boolean(marker),
        reason: marker ? EXEMPT.reasonFrom(marker) : '',
      })
    }
  }

  controls.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  return controls
}

// Marcadores `form-control-label-exempt` que NO tienen un control sin nombre en
// su misma línea ni en la siguiente: quedaron colgando tras un refactor y hay que
// quitarlos (o el marcador está mal ubicado).
export function collectDanglingFormControlMarkers(root = process.cwd()) {
  const projectRoot = resolve(root)
  const dangling = []

  for (const file of scannedSourceFiles(root)) {
    const raw = readFileSync(file, 'utf8')
    if (!raw.includes('form-control-label-exempt')) continue
    const constructLines = new Set(
      unlabeledControlLines(stripBlockComments(raw)).map((c) => c.line),
    )
    const rel = relative(projectRoot, file)
    for (const line of EXEMPT.danglingLines(raw.split('\n'), constructLines))
      dangling.push({ file: rel, line })
  }
  return dangling
}

export function checkFormControlLabels({
  root = process.cwd(),
  baseline = FORM_CONTROL_LABEL_BASELINE,
} = {}) {
  const all = collectFormControlLabels(root)
  const unlabeled = all.filter((entry) => !entry.exempt)
  const dangling = collectDanglingFormControlMarkers(root)

  const failures = []
  if (unlabeled.length > baseline)
    failures.push({ kind: 'increase', actual: unlabeled.length, baseline })
  if (dangling.length > 0)
    failures.push({
      kind: 'danglingMarker',
      files: dangling.map((d) => `${d.file}:${d.line}`),
    })

  return {
    ok: failures.length === 0,
    count: unlabeled.length,
    baseline,
    unlabeled,
    exempt: all.filter((entry) => entry.exempt),
    dangling,
    failures,
    dropped: unlabeled.length < baseline,
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isCli) {
  const result = checkFormControlLabels()

  console.log('\nForm control labels ratchet:')
  console.log('-'.repeat(72))
  console.log(
    `  controles sin nombre accesible  ${String(result.count).padStart(4)}/${result.baseline}` +
      `   (exentos por marcador: ${result.exempt.length})`,
  )
  console.log('-'.repeat(72))

  if (!result.ok) {
    if (result.count > result.baseline) {
      console.error(
        '\nSubió la cantidad de controles de formulario sin nombre accesible. ' +
          'Asociá un <label htmlFor>+id, o agregá aria-label/aria-labelledby ' +
          '(nombre conciso en español neutro). Si el control va ENVUELTO por un ' +
          '<label> padre (nombre nativo por anidamiento), poné en la línea de ' +
          'arriba un comentario `form-control-label-exempt: <razón>`. Nuevos sin ' +
          'etiquetar:',
      )
      for (const entry of result.unlabeled.slice(0, 30))
        console.error(`  - ${entry.file}:${entry.line} <${entry.kind}>`)
    }
    if (result.dangling.length > 0) {
      console.error(
        '\nMarcadores `form-control-label-exempt` sin un control sin nombre debajo ' +
          '(quitalos o reubicalos):',
      )
      for (const key of result.failures.find((f) => f.kind === 'danglingMarker').files)
        console.error(`  - ${key}`)
    }
    console.error('')
    process.exit(1)
  }

  if (result.dropped) {
    console.log(
      `\nBajaste los controles sin nombre a ${result.count} (baseline ${result.baseline}). ` +
        'Actualizá FORM_CONTROL_LABEL_BASELINE en scripts/check-form-control-labels.mjs.',
    )
  }

  console.log('\nform control labels ratchet ok\n')
}
