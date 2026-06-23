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

export const ICON_BUTTON_BASELINE = 146

// <button> de solo-ícono legítimos que NO deben migrar (raro; p. ej. un caso con
// render muy condicional). Allowlist file:line con razón, como hard-delete.
export const ICON_BUTTON_EXEMPT = new Map([])

const BUTTON_OPEN_RE = /<button\b/g
// Contenido = exactamente un ícono autocerrado (componente <XxxIcon …/> o <svg …/>).
const PURE_ICON_RE = /^<(?:[A-Z][A-Za-z0-9]*Icon|svg)\b[^>]*\/>$/
const CLOSE_RE = /<\/button>/g

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

export function collectIconButtons(root = process.cwd()) {
  const projectRoot = resolve(root)
  const srcRoot = join(projectRoot, 'src')
  const found = []

  for (const file of walk(srcRoot).filter(isScannedFile)) {
    const source = readFileSync(file, 'utf8')
    if (!source.includes('<button')) continue
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
      const line = source.slice(0, m.index).split('\n').length
      found.push({ file: relative(projectRoot, file), line })
    }
  }
  found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  return found
}

export function checkIconButtons({
  root = process.cwd(),
  baseline = ICON_BUTTON_BASELINE,
  exempt = ICON_BUTTON_EXEMPT,
} = {}) {
  const all = collectIconButtons(root)
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
  const result = checkIconButtons()
  console.log('\nIconButton adoption ratchet:')
  console.log('-'.repeat(72))
  console.log(
    `  <button> de solo-ícono sin IconButton  ${String(result.count).padStart(4)}/${result.baseline}`,
  )
  console.log('-'.repeat(72))
  if (!result.ok) {
    if (result.count > result.baseline) {
      console.error(
        '\nSubió la cantidad de botones de solo-ícono sin IconButton. Usá ' +
          '<IconButton label="…"> (src/components/IconButton.tsx) en vez de un ' +
          '<button> con ícono y aria-label. Nuevos:',
      )
      for (const e of result.offenders.slice(0, 30))
        console.error(`  - ${e.file}:${e.line}`)
    }
    if (result.staleExempt.length > 0) {
      console.error(
        '\nEntradas EXEMPT que ya no aplican (removelas de ICON_BUTTON_EXEMPT):',
      )
      for (const key of result.staleExempt) console.error(`  - ${key}`)
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
