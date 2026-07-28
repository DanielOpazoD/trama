#!/usr/bin/env node
/**
 * Gate: un `vi.mock` debe cubrir todo lo que el módulo bajo prueba le pide.
 *
 * POR QUÉ EXISTE
 *
 * `vi.mock(ruta, () => ({ … }))` devuelve un objeto **sin tipar**. El
 * compilador no sabe que ese objeto debe parecerse al módulo real, así que
 * añadir un export nuevo y usarlo desde un endpoint deja el mock incompleto sin
 * un solo error de TypeScript: el endpoint llama a `undefined` y el test falla
 * en runtime con un error genérico, lejos de la causa.
 *
 * Pasó de verdad al añadir `needsReconnect` a `_lib/x/index.ts` (PR #362): dos
 * endpoints reventaron con `INTERNAL` y hubo que rastrearlo a mano. En un repo
 * con un solo `any` y cero `@ts-ignore`, los mocks de módulo son el punto ciego
 * real del compilador.
 *
 * LA REGLA
 *
 * No es "mockea todo el módulo" — un mock parcial es legítimo y deseable: se
 * mockea lo que hace falta. La regla es más fina:
 *
 *   el mock debe proveer todo lo que los módulos bajo prueba
 *   importan de ese módulo.
 *
 * Es decir: si el test mockea `./x/index.js` y también importa `../x-status`,
 * entonces todo lo que `x-status` importe de `./x/index.js` tiene que estar en
 * el mock. Nada más, y nada menos.
 *
 * LO QUE ESTE GATE NO VE (a propósito, y conviene saberlo)
 *
 *   - Factories que no son un objeto literal (`() => setupMockSql()`): no hay
 *     claves que leer estáticamente.
 *   - Factories con spread (`...actual`): ya cubren todo por construcción.
 *   - `async (importOriginal) => …`: idem.
 *   - Uso **transitivo**: si el módulo bajo prueba importa un helper y ese
 *     helper usa el módulo mockeado, aquí no se ve. Sólo se miran los imports
 *     directos del sujeto.
 *
 * El resumen imprime cuántos mocks quedaron sin analizar por cada motivo. Un
 * gate que no dice qué no mira es un gate en el que no se puede confiar.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// `new URL` no está en los globals del eslint de scripts/: derivamos la raíz
// desde el propio archivo, como hacen los demás checks del repo.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOTS = ['src', 'netlify']
const EXTS = ['.ts', '.tsx', '.mts', '.mjs', '.js']

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const isTest = (f) => /\.test\.(ts|tsx)$/.test(f)

/**
 * Resuelve un especificador relativo a un archivo real del repo. Los imports
 * usan extensión `.js` aunque el archivo sea `.ts`/`.mts` (ESM + TS), así que
 * hay que probar variantes.
 */
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(fromFile), spec)
  const candidates = [base]
  const noExt = base.replace(/\.(js|mjs)$/, '')
  for (const ext of EXTS) candidates.push(noExt + ext)
  for (const ext of EXTS) candidates.push(join(noExt, 'index' + ext))
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c
    } catch {
      /* siguiente candidato */
    }
  }
  return null
}

/**
 * Marca qué posiciones del fuente son **estructurales**: fuera de cadenas,
 * plantillas y comentarios.
 *
 * Sin esto, contar llaves y comas sobre el texto crudo se rompe con un mock tan
 * normal como `{ label: 'Sí, continuar' }`: la coma dentro de la cadena partía
 * la propiedad y `label` desaparecía del análisis. Un gate que no ve una clave
 * la reporta como faltante — o peor, se desorienta con la profundidad y deja de
 * ver un mock incompleto.
 */
function structuralMask(src) {
  const mask = new Uint8Array(src.length)
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    const next = src[i + 1]
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (ch === "'" || ch === '"') {
      const quote = ch
      i++
      while (i < src.length && src[i] !== quote) i += src[i] === '\\' ? 2 : 1
      i++
      continue
    }
    if (ch === '`') {
      i++
      let interp = 0
      while (i < src.length) {
        if (src[i] === '\\') {
          i += 2
          continue
        }
        if (src[i] === '$' && src[i + 1] === '{') {
          interp++
          i += 2
          continue
        }
        if (interp > 0 && src[i] === '}') {
          interp--
          i++
          continue
        }
        if (interp === 0 && src[i] === '`') break
        i++
      }
      i++
      continue
    }
    mask[i] = 1
    i++
  }
  return mask
}

/** Claves de primer nivel de un objeto literal, respetando anidamiento. */
function topLevelKeys(body) {
  const mask = structuralMask(body)
  const keys = []
  let depth = 0
  let hasSpread = false
  let pendingStart = 0
  const pushKey = (seg) => {
    const m = seg.match(
      /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*([A-Za-z_$][\w$]*)\s*[,:]?/,
    )
    if (m) keys.push(m[1])
  }
  for (let i = 0; i < body.length; i++) {
    if (!mask[i]) continue
    const ch = body[i]
    if (ch === '{' || ch === '[' || ch === '(') depth++
    else if (ch === '}' || ch === ']' || ch === ')') depth--
    else if (depth === 0) {
      if (body.startsWith('...', i)) hasSpread = true
      if (ch === ',') {
        pushKey(body.slice(pendingStart, i))
        pendingStart = i + 1
      }
    }
  }
  pushKey(body.slice(pendingStart))
  return { keys, hasSpread }
}

/** Extrae el cuerpo `{...}` que empieza en `open` (índice de la llave). */
function readBalanced(src, open) {
  const mask = structuralMask(src)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (!mask[i]) continue
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return null
}

/** `vi.mock('spec', () => ({ … }))` con factory de objeto literal. */
function findLiteralMocks(src) {
  const out = []
  const re =
    /vi\.mock\(\s*['"]([^'"]+)['"]\s*,\s*(async\s*)?\(([^)]*)\)\s*=>\s*(\(\s*\{|\{)/g
  let m
  while ((m = re.exec(src))) {
    const [, spec, isAsync, params, opener] = m
    if (isAsync || params.trim()) {
      out.push({ spec, skip: 'factory con importOriginal' })
      continue
    }
    if (!opener.includes('(')) {
      out.push({ spec, skip: 'factory con cuerpo de bloque' })
      continue
    }
    const braceIdx = src.indexOf('{', m.index + m[0].length - opener.length)
    const body = readBalanced(src, braceIdx)
    if (body == null) {
      out.push({ spec, skip: 'no se pudo balancear el literal' })
      continue
    }
    const { keys, hasSpread } = topLevelKeys(body)
    if (hasSpread) {
      out.push({ spec, skip: 'factory con spread' })
      continue
    }
    out.push({ spec, keys })
  }
  // Los que no matchean el patrón literal (p.ej. `() => setupMockSql()`).
  const all = [...src.matchAll(/vi\.mock\(\s*['"]([^'"]+)['"]/g)].map((x) => x[1])
  for (const spec of all) {
    if (!out.some((o) => o.spec === spec)) out.push({ spec, skip: 'factory no literal' })
  }
  return out
}

/**
 * Nombres que el módulo exporta **en runtime**: funciones, const, class, enum.
 * Los `export type` / `export interface` desaparecen al compilar, así que un
 * mock no tiene por qué proveerlos aunque el sujeto los importe sin la palabra
 * `type` — TypeScript los borra igual.
 *
 * Fue el primer resultado del gate: siete "fallos" que eran todos tipos.
 *
 * Sigue los `export * from` un nivel, que es lo que hacen los barrels del repo.
 */
function runtimeExportsOf(file, seen = new Set()) {
  if (seen.has(file)) return new Set()
  seen.add(file)
  let src
  try {
    src = readFileSync(file, 'utf8')
  } catch {
    return new Set()
  }
  const names = new Set()

  for (const m of src.matchAll(
    /^export\s+(?:async\s+)?(?:function|const|let|var|class|enum)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    names.add(m[1])
  }
  // `export { a, b }` sin `type` delante.
  for (const m of src.matchAll(/^export\s+\{([^}]*)\}/gm)) {
    for (const raw of m[1].split(',')) {
      const t = raw.trim()
      if (!t || /^type\s/.test(t)) continue
      const parts = t.split(/\s+as\s+/)
      names.add((parts[1] ?? parts[0]).trim())
    }
  }
  for (const m of src.matchAll(/^export\s+\*\s+from\s*['"]([^'"]+)['"]/gm)) {
    const target = resolveSpec(file, m[1])
    if (target) for (const n of runtimeExportsOf(target, seen)) names.add(n)
  }
  return names
}

/** `import { a, b } from 'spec'` — omite los `import type`. */
function namedImportsFrom(src, matchesSpec) {
  const used = new Set()
  // Acepta `import Def, { a, b } from '…'`: sin esto, los imports mixtos
  // quedaban invisibles y un mock incompleto pasaba sin avisar.
  const re =
    /import\s+(type\s+)?(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(src))) {
    const [, typeOnly, names, spec] = m
    if (typeOnly) continue
    if (!matchesSpec(spec)) continue
    for (const raw of names.split(',')) {
      const name = raw
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim()
      if (name) used.add(name)
    }
  }
  return used
}

/** Módulos locales que el test importa y que NO están mockeados: los sujetos. */
function subjectsOf(testFile, src, mockedPaths) {
  const subjects = new Set()
  const re = /import\s+(?:[\w*{}\s,$]+\s+from\s+)?['"](\.[^'"]+)['"]/g
  let m
  while ((m = re.exec(src))) {
    const resolved = resolveSpec(testFile, m[1])
    if (!resolved || isTest(resolved)) continue
    if (mockedPaths.has(resolved)) continue
    subjects.add(resolved)
  }
  return subjects
}

export function checkMockCompleteness(root = projectRoot) {
  const files = ROOTS.flatMap((r) => {
    try {
      return walk(join(root, r))
    } catch {
      return []
    }
  }).filter(isTest)

  const failures = []
  const skipped = new Map()
  let analysed = 0

  for (const testFile of files) {
    const src = readFileSync(testFile, 'utf8')
    if (!src.includes('vi.mock(')) continue

    const mocks = findLiteralMocks(src)
    const mockedPaths = new Set()
    for (const mk of mocks) {
      const r = resolveSpec(testFile, mk.spec)
      if (r) mockedPaths.add(r)
    }
    const subjects = subjectsOf(testFile, src, mockedPaths)
    if (subjects.size === 0) continue

    for (const mock of mocks) {
      if (mock.skip) {
        skipped.set(mock.skip, (skipped.get(mock.skip) ?? 0) + 1)
        continue
      }
      const target = resolveSpec(testFile, mock.spec)
      if (!target) {
        // Distinguir importa: un paquete externo está fuera de alcance por
        // diseño, pero un módulo local que no se resuelve es un agujero de
        // ESTE gate y hay que verlo.
        const reason = mock.spec.startsWith('.')
          ? 'módulo local sin resolver (revisar)'
          : 'módulo externo (fuera de alcance)'
        skipped.set(reason, (skipped.get(reason) ?? 0) + 1)
        continue
      }
      analysed++
      const provided = new Set(mock.keys)
      const runtimeExports = runtimeExportsOf(target)

      for (const subject of subjects) {
        const subjectSrc = readFileSync(subject, 'utf8')
        const used = namedImportsFrom(
          subjectSrc,
          (spec) => resolveSpec(subject, spec) === target,
        )
        // Sólo cuentan los que existen en runtime: un tipo importado sin
        // `import type` no necesita estar en el mock.
        const missing = [...used].filter((u) => runtimeExports.has(u) && !provided.has(u))
        if (missing.length > 0) {
          failures.push({
            test: relative(root, testFile),
            mock: mock.spec,
            subject: relative(root, subject),
            missing,
          })
        }
      }
    }
  }

  return { failures, skipped, analysed }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isCli) {
  const { failures, skipped, analysed } = checkMockCompleteness()

  console.log('\nCompletitud de mocks de módulo:')
  console.log('-'.repeat(72))
  console.log(`  mocks analizados: ${analysed}`)
  for (const [reason, n] of [...skipped.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  sin analizar (${reason}): ${n}`)
  }
  console.log('-'.repeat(72))

  if (failures.length > 0) {
    console.error('\nMocks incompletos — el sujeto llamaría a `undefined` en runtime:\n')
    for (const f of failures) {
      console.error(`  ${f.test}`)
      console.error(`    mock de ${f.mock} — falta: ${f.missing.join(', ')}`)
      console.error(`    lo usa: ${f.subject}\n`)
    }
    console.error(
      `${failures.length} mock(s) incompletos. Añade esas claves al factory del ` +
        '`vi.mock`, o usa `importOriginal` si quieres el módulo real.\n',
    )
    process.exit(1)
  }

  console.log('\nmock completeness ok\n')
}
