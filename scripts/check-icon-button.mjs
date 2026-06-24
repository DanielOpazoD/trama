#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Gate RATCHET de adopción del primitivo IconButton.
//
// El repo tenía ~250 botones de ícono con markup bespoke; IconButton centraliza
// el contrato (type=button + aria-label obligatorio + focus-visible). Este gate
// cuenta los <button> de SOLO ÍCONO que todavía NO usan IconButton y congela el
// número: como design-tokens / modal-overlay / form-control-labels, solo puede
// BAJAR. Migrar un botón a <IconButton> lo saca del conteo.
//
// "Solo ícono" se define de forma PRECISA para no contar falsos positivos: el
// contenido del <button>, sin espacios, es EXACTAMENTE un componente de ícono
// autocerrado (`<CloseIcon size={14} />`) y nada más. Así un botón de ícono +
// texto (`<Icon/><span>{label}</span>`) NO cuenta — detectarlo por "ausencia de
// texto" fallaría porque el texto dinámico vive en `{…}`. Sub-contar es seguro
// para un ratchet: solo institucionaliza los casos inequívocos.
//
// EXENCIONES por MARCADOR INLINE (no por allowlist file:LÍNEA, que se rompe al
// mover líneas — mismo patrón que check:focus-ring): un <button> de solo-ícono
// queda exento si la línea inmediatamente anterior (o la misma) trae
// `icon-button-exempt: <razón>`. Son los raros casos legítimos que NO deben
// migrar (p. ej. un render muy condicional donde IconButton no encaja). Como el
// botón vive en posición de hijo JSX, el marcador va en un comentario JSX
// `{/* … */}` sobre la línea del <button>. Un marcador sin un <button> de
// solo-ícono debajo (dangling) hace fallar el gate, para que se limpie.

export const ICON_BUTTON_BASELINE = 0

const BUTTON_OPEN_RE = /<button\b/g
// Contenido = exactamente un ícono autocerrado (componente <XxxIcon …/> o <svg …/>).
const PURE_ICON_RE = /^<(?:[A-Z][A-Za-z0-9]*Icon|svg)\b[^>]*\/>$/
const CLOSE_RE = /<\/button>/g
// Marcador de exención inline. La razón es lo que sigue a los dos puntos.
const EXEMPT_MARKER_RE = /icon-button-exempt:?\s*(.*)$/

// La razón cruda. Quita el cierre de un comentario JSX (`*/}` / `*/`) que el
// `(.*)$` arrastra cuando el marcador va como `{/* … */}` en posición de hijo JSX.
function markerReason(match) {
  return match[1].replace(/\s*\*\/\}?\s*$/, '').trim()
}

// Extrae un bloque balanceado desde `<` (de un tag) hasta su `>` de cierre a
// profundidad 0, respetando strings y `{...}` (los handlers traen `>` en llaves).
function tagEnd(src, startIdx) {
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
    else if (c === '>' && depth === 0) return i
  }
  return -1
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

// Líneas (1-based) de `source` con un <button> de SOLO ÍCONO (un único componente
// de ícono autocerrado como children, sin texto ni otros hijos).
function iconButtonLines(source) {
  if (!source.includes('<button')) return []
  const lines = []
  for (const m of source.matchAll(BUTTON_OPEN_RE)) {
    const openEnd = tagEnd(source, m.index)
    if (openEnd === -1) continue
    // Self-closing (`<button … />`): sin children → no es de solo-ícono.
    if (source[openEnd - 1] === '/') continue
    CLOSE_RE.lastIndex = openEnd
    const close = CLOSE_RE.exec(source)
    if (!close) continue
    const inner = source.slice(openEnd + 1, close.index).trim()
    if (!PURE_ICON_RE.test(inner)) continue // no es exactamente un ícono → no aplica
    lines.push(source.slice(0, m.index).split('\n').length)
  }
  return lines
}

// Devuelve TODO <button> de solo-ícono, marcando si está exento (por el marcador
// inline en su línea o en la inmediatamente anterior) y con su razón.
export function collectIconButtons(root = process.cwd()) {
  const projectRoot = resolve(root)
  const srcRoot = join(projectRoot, 'src')
  const found = []

  for (const file of walk(srcRoot).filter(isScannedFile)) {
    const source = readFileSync(file, 'utf8')
    const lines = iconButtonLines(source)
    if (lines.length === 0) continue
    const rel = relative(projectRoot, file)
    const rawLines = source.split('\n')
    for (const line of lines) {
      const marker =
        EXEMPT_MARKER_RE.exec(rawLines[line - 1] ?? '') ||
        (line > 1 ? EXEMPT_MARKER_RE.exec(rawLines[line - 2] ?? '') : null)
      found.push({
        file: rel,
        line,
        exempt: Boolean(marker),
        reason: marker ? markerReason(marker) : '',
      })
    }
  }
  found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  return found
}

// Marcadores `icon-button-exempt` que NO tienen un <button> de solo-ícono en su
// misma línea ni en la siguiente: quedaron colgando tras un refactor y hay que
// quitarlos (o el marcador está mal ubicado).
export function collectDanglingIconButtonMarkers(root = process.cwd()) {
  const projectRoot = resolve(root)
  const srcRoot = join(projectRoot, 'src')
  const dangling = []

  for (const file of walk(srcRoot).filter(isScannedFile)) {
    const source = readFileSync(file, 'utf8')
    if (!source.includes('icon-button-exempt')) continue
    const iconLines = new Set(iconButtonLines(source))
    const rel = relative(projectRoot, file)
    const rawLines = source.split('\n')
    for (let i = 0; i < rawLines.length; i++) {
      if (!EXEMPT_MARKER_RE.test(rawLines[i])) continue
      const here = i + 1
      if (!iconLines.has(here) && !iconLines.has(here + 1))
        dangling.push({ file: rel, line: here })
    }
  }
  return dangling
}

export function checkIconButtons({
  root = process.cwd(),
  baseline = ICON_BUTTON_BASELINE,
} = {}) {
  const all = collectIconButtons(root)
  const offenders = all.filter((e) => !e.exempt)
  const dangling = collectDanglingIconButtonMarkers(root)
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
  const result = checkIconButtons()
  console.log('\nIconButton adoption ratchet:')
  console.log('-'.repeat(72))
  console.log(
    `  <button> de solo-ícono sin IconButton  ${String(result.count).padStart(4)}/${result.baseline}` +
      `   (exentos por marcador: ${result.exempt.length})`,
  )
  console.log('-'.repeat(72))
  if (!result.ok) {
    if (result.count > result.baseline) {
      console.error(
        '\nSubió la cantidad de botones de solo-ícono sin IconButton. Usá ' +
          '<IconButton label="…"> (src/components/IconButton.tsx) en vez de un ' +
          '<button> con ícono y aria-label. Si el caso es legítimo y NO debe migrar, ' +
          'poné en la línea de arriba un comentario `icon-button-exempt: <razón>`. ' +
          'Nuevos:',
      )
      for (const e of result.offenders.slice(0, 30))
        console.error(`  - ${e.file}:${e.line}`)
    }
    if (result.dangling.length > 0) {
      console.error(
        '\nMarcadores `icon-button-exempt` sin un <button> de solo-ícono debajo ' +
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
      `\nBajaste los botones de solo-ícono sin IconButton a ${result.count} ` +
        `(baseline ${result.baseline}). Actualizá ICON_BUTTON_BASELINE en ` +
        'scripts/check-icon-button.mjs.',
    )
  }
  console.log('\nicon button adoption ratchet ok\n')
}
