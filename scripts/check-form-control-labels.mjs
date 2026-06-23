#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

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

export const FORM_CONTROL_LABEL_BASELINE = 0

// Controles SIN etiqueta para el escaneo plano pero LEGÍTIMAMENTE nombrados por
// un <label> padre que los envuelve (asociación nativa por anidamiento, que el
// escaneo no detecta). El nombre accesible viene del texto del <label>; agregar
// aria-label sería redundante y, si difiere del texto visible, viola WCAG 2.5.3
// (Label in Name). Allowlist con razón verificada, como hard-delete.
export const FORM_CONTROL_LABEL_EXEMPT = new Map([
  [
    'src/components/notas/ClavesVaultParts.tsx:124',
    'Checkbox envuelto por <label> con <span>Llave física</span>.',
  ],
  [
    'src/components/notas/ClavesVaultParts.tsx:284',
    'Checkbox envuelto por <label> con el texto "crítica".',
  ],
  [
    'src/components/notas/ClavesView.tsx:357',
    'Checkbox envuelto por <label> con el texto "crítica".',
  ],
  [
    'src/components/notas/TaskItem.tsx:206',
    'Input date envuelto por <label> con el texto "vence".',
  ],
])

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
// línea del reporte.
function stripBlockComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

function isLabeled(tag, htmlForTargets) {
  if (LABEL_ATTR_RE.test(tag)) return true
  if (HIDDEN_RE.test(tag)) return true
  const id = tagId(tag)
  return id != null && htmlForTargets.has(id)
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, files)
    else files.push(path)
  }
  return files
}

function isScannedFile(file) {
  return file.endsWith('.tsx') && !file.endsWith('.test.tsx')
}

export function collectFormControlLabels(root = process.cwd()) {
  const projectRoot = resolve(root)
  const srcRoot = join(projectRoot, 'src')
  const unlabeled = []

  for (const file of walk(srcRoot).filter(isScannedFile)) {
    const source = stripBlockComments(readFileSync(file, 'utf8'))
    if (!CONTROL_RE.test(source)) continue
    CONTROL_RE.lastIndex = 0
    const htmlForTargets = collectHtmlForTargets(source)
    for (const m of source.matchAll(CONTROL_RE)) {
      const tag = extractTag(source, m.index)
      if (isLabeled(tag, htmlForTargets)) continue
      const line = source.slice(0, m.index).split('\n').length
      unlabeled.push({
        file: relative(projectRoot, file),
        line,
        kind: m[1],
      })
    }
  }

  unlabeled.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  return unlabeled
}

export function checkFormControlLabels({
  root = process.cwd(),
  baseline = FORM_CONTROL_LABEL_BASELINE,
  exempt = FORM_CONTROL_LABEL_EXEMPT,
} = {}) {
  const all = collectFormControlLabels(root)
  const unlabeled = all.filter((entry) => !exempt.has(`${entry.file}:${entry.line}`))
  const staleExempt = [...exempt.keys()].filter(
    (key) => !all.some((entry) => `${entry.file}:${entry.line}` === key),
  )

  const failures = []
  if (unlabeled.length > baseline)
    failures.push({ kind: 'increase', actual: unlabeled.length, baseline })
  if (staleExempt.length > 0) failures.push({ kind: 'staleExempt', files: staleExempt })

  return {
    ok: failures.length === 0,
    count: unlabeled.length,
    baseline,
    unlabeled,
    staleExempt,
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
    `  controles sin nombre accesible  ${String(result.count).padStart(4)}/${result.baseline}`,
  )
  console.log('-'.repeat(72))

  if (!result.ok) {
    if (result.count > result.baseline) {
      console.error(
        '\nSubió la cantidad de controles de formulario sin nombre accesible. ' +
          'Asociá un <label htmlFor>+id, o agregá aria-label/aria-labelledby ' +
          '(nombre conciso en español neutro). Nuevos sin etiquetar:',
      )
      for (const entry of result.unlabeled.slice(0, 30))
        console.error(`  - ${entry.file}:${entry.line} <${entry.kind}>`)
    }
    if (result.staleExempt.length > 0) {
      console.error(
        '\nEntradas EXEMPT que ya no aplican (removelas de FORM_CONTROL_LABEL_EXEMPT):',
      )
      for (const key of result.staleExempt) console.error(`  - ${key}`)
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
