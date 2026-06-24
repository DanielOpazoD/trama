#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { scannedSourceFiles } from './lib/source-files.mjs'

// Gate del CONTRATO de respuestas de ERROR de endpoints.
//
// La convención (AGENTS.md, docs/conventions/api.md): los errores de endpoint se
// devuelven con `ApiErrors.*` (_lib/api-error.ts), nunca con un
// `new Response('texto', { status: 4xx })` ni `Response.json(body, { status: 4xx })`
// hand-rolled. ApiErrors garantiza la shape canónica
//   { error: { code, message, requestId, details? } }
// que el cliente y la extensión parsean; un error hand-rolled rompe ese contrato
// (cuerpo inconsistente, sin requestId, sin code). Hoy 94 handlers ya usan
// ApiErrors y NO hay errores hand-rolled: este gate CONGELA esa compliance
// (baseline 0) para que no entren nuevos.
//
// QUÉ cuenta como infracción: una llamada `new Response(...)` o `Response.json(...)`
// cuyo ResponseInit (2º argumento) trae un `status:` LITERAL >= 400, fuera del
// constructor canónico allowlisteado. Se mira el 2º argumento (no el cuerpo) para
// no confundir un `JSON.stringify({ status: 404 })` —dato— con el status HTTP real.
//
// ALCANCE / límites deliberados:
//   - Solo status LITERAL (4xx/5xx). Los reenviadores con status DINÁMICO
//     (handler-wrap reenvía `response.status`; ssrf-fetch reenvía
//     `res.statusCode`; api-error arma el status del ApiError) NO se tocan: no
//     hornean un error literal, reenvían/construyen el canónico. El riesgo real
//     —`new Response('Not found', { status: 404 })`— sí es literal y se caza.
//   - Redirects (3xx), 2xx, 204, streaming y archivos binarios quedan fuera por
//     status < 400.
//   - Solo netlify/functions (.mts/.ts); los comentarios se blanquean para no
//     marcar ejemplos en JSDoc/`//` (api-error.ts documenta el patrón viejo).

export const API_ERROR_SHAPE_BASELINE = 0

// Archivos que SÍ pueden construir la Response de error: el constructor canónico.
// Allowlist por ARCHIVO (granularidad arquitectónica: el archivo entero ES el
// lugar sancionado), con razón verificada — como modal-overlay / hard-delete.
export const API_ERROR_SHAPE_ALLOWLIST = new Map([
  [
    'netlify/functions/_lib/api-error.ts',
    'Constructor canónico de ApiErrors: es el único lugar sancionado para armar la Response de error con la shape { error: { code, message, requestId } }.',
  ],
])

// `new Response(` o `Response.json(` — el `(` de apertura queda al final del match.
const RESPONSE_CALL_RE = /\b(?:new\s+Response|Response\.json)\s*\(/g
// `status:` literal de 3 dígitos dentro del ResponseInit.
const LITERAL_STATUS_RE = /\bstatus:\s*(\d{3})\b/

// Blanquea comentarios JS (`//` y `/* */`) preservando saltos de línea y
// respetando strings ('...', "...", `...`), para no confundir un `https://` ni un
// ejemplo de `new Response(...)` dentro de un comentario con código real.
function stripComments(source) {
  let out = ''
  let str = null
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    const next = source[i + 1]
    if (str) {
      out += c
      if (c === '\\') {
        out += next ?? ''
        i += 1
      } else if (c === str) {
        str = null
      }
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      str = c
      out += c
      continue
    }
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      out += '\n'
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' '
        i += 1
      }
      i += 1
      continue
    }
    out += c
  }
  return out
}

// Texto balanceado de los argumentos desde el `(` (índice openParen) hasta el `)`
// de cierre a profundidad 0, respetando strings y anidamientos.
function callArgs(src, openParen) {
  let depth = 0
  let str = null
  for (let i = openParen; i < src.length; i++) {
    const c = src[i]
    if (str) {
      if (c === '\\') i += 1
      else if (c === str) str = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') str = c
    else if (c === '(' || c === '[' || c === '{') depth += 1
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1
      if (depth === 0) return src.slice(openParen + 1, i)
    }
  }
  return src.slice(openParen + 1)
}

// Divide los argumentos de nivel superior por comas a profundidad 0.
function splitTopLevel(argsText) {
  const args = []
  let depth = 0
  let str = null
  let start = 0
  for (let i = 0; i < argsText.length; i++) {
    const c = argsText[i]
    if (str) {
      if (c === '\\') i += 1
      else if (c === str) str = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') str = c
    else if (c === '(' || c === '[' || c === '{') depth += 1
    else if (c === ')' || c === ']' || c === '}') depth -= 1
    else if (c === ',' && depth === 0) {
      args.push(argsText.slice(start, i))
      start = i + 1
    }
  }
  args.push(argsText.slice(start))
  return args
}

// El status HTTP literal del ResponseInit (2º argumento), o null si no hay 2º
// argumento o el status no es un literal de 3 dígitos (p. ej. es dinámico).
function literalStatus(argsText) {
  const args = splitTopLevel(argsText)
  if (args.length < 2) return null
  const m = LITERAL_STATUS_RE.exec(args[1])
  return m ? Number(m[1]) : null
}

// Errores hand-rolled: llamadas Response con status literal >= 400.
export function collectHandRolledErrors(root = process.cwd()) {
  const projectRoot = resolve(root)
  const found = []
  for (const file of scannedSourceFiles(root, {
    dir: 'netlify/functions',
    extensions: ['.mts', '.ts'],
  })) {
    const source = stripComments(readFileSync(file, 'utf8'))
    if (!source.includes('Response')) continue
    const rel = relative(projectRoot, file)
    for (const m of source.matchAll(RESPONSE_CALL_RE)) {
      const openParen = m.index + m[0].length - 1
      const status = literalStatus(callArgs(source, openParen))
      if (status == null || status < 400) continue
      found.push({
        file: rel,
        line: source.slice(0, m.index).split('\n').length,
        status,
      })
    }
  }
  found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  return found
}

export function checkApiErrorShape({
  root = process.cwd(),
  baseline = API_ERROR_SHAPE_BASELINE,
  allowlist = API_ERROR_SHAPE_ALLOWLIST,
} = {}) {
  const all = collectHandRolledErrors(root)
  const offenders = all.filter((e) => !allowlist.has(e.file))
  const failures = []
  if (offenders.length > baseline)
    failures.push({ kind: 'increase', actual: offenders.length, baseline })
  return {
    ok: failures.length === 0,
    count: offenders.length,
    baseline,
    offenders,
    allowlisted: all.filter((e) => allowlist.has(e.file)),
    failures,
    dropped: offenders.length < baseline,
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isCli) {
  const result = checkApiErrorShape()
  console.log('\nApi error shape gate:')
  console.log('-'.repeat(72))
  console.log(
    `  errores hand-rolled (new Response/Response.json 4xx-5xx)  ${String(result.count).padStart(4)}/${result.baseline}`,
  )
  console.log('-'.repeat(72))
  if (!result.ok) {
    console.error(
      '\nSubió la cantidad de errores de endpoint hand-rolled. Devolvé los errores ' +
        'con `ApiErrors.*` (netlify/functions/_lib/api-error.ts) para conservar la ' +
        'shape canónica { error: { code, message, requestId } }, en vez de un ' +
        '`new Response(..., { status: 4xx })` / `Response.json(..., { status: 4xx })` ' +
        'directo. Nuevos:',
    )
    for (const e of result.offenders.slice(0, 30))
      console.error(`  - ${e.file}:${e.line} (status ${e.status})`)
    console.error('')
    process.exit(1)
  }
  if (result.dropped) {
    console.log(
      `\nBajaste los errores hand-rolled a ${result.count} (baseline ${result.baseline}). ` +
        'Actualizá API_ERROR_SHAPE_BASELINE en scripts/check-api-error-shape.mjs.',
    )
  }
  console.log('\napi error shape gate ok\n')
}
