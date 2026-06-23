#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Gate RATCHET del contrato de design tokens (docs/conventions/design.md).
//
// El contrato dice: nada de arbitrary values tipográficos (`text-[14px]`,
// `tracking-[0.18em]`) ni aliases legacy de la type scale (text-sm/xs/...);
// el código nuevo usa los tokens semánticos (text-body, text-caption, etc.).
// Hoy todavía conviven decenas de arbitrary y cientos de aliases legacy, así
// que en vez de migrar todo de golpe congelamos el conteo actual y solo
// permitimos BAJARLO. Cada PR que reintroduzca uno de estos por encima del
// baseline falla; cuando alguien migra de verdad, el conteo baja y el gate
// avisa que hay que actualizar el baseline (mismo gesto que structure-ratchets).
//
// Se cuentan OCURRENCIAS (no archivos) en src/**/*.tsx, excluyendo tests
// (*.test.tsx): es donde vive el JSX con clases Tailwind.

// Baseline = conteo actual del repo. Bajar SOLO cuando se migra a tokens
// semánticos; si baja, actualizar estos números (el gate lo recuerda).
export const DESIGN_TOKEN_BASELINE = {
  // Arbitrary tipográfico: text-[14px], text-[0.85em], tracking-[0.18em]…
  // (NO cuenta text-[color:var(--x)], que es color, no tamaño/tracking).
  arbitrary: 18,
  // Aliases legacy de la type scale: text-(sm|xs|base|lg|xl|2xl).
  legacy: 613,
}

// text-[<size>] con unidad px/rem/em, descartando text-[color:...].
const ARBITRARY_SIZE_RE = /\btext-\[[^\]]*(?:px|rem|em)[^\]]*\]/g
// tracking-[<algo>] siempre es arbitrary (no hay tracking de color).
const ARBITRARY_TRACKING_RE = /\btracking-\[[^\]]+\]/g
// Aliases legacy de la type scale.
const LEGACY_TYPE_SCALE_RE = /\btext-(?:sm|xs|base|lg|xl|2xl)\b/g

function isColorArbitrary(match) {
  return match.startsWith('text-[color:')
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path, files)
    else files.push(path)
  }
  return files
}

function isScannedFile(file) {
  return file.endsWith('.tsx') && !file.endsWith('.test.tsx')
}

function countMatches(source, regex, reject) {
  let count = 0
  for (const match of source.matchAll(regex)) {
    if (reject && reject(match[0])) continue
    count += 1
  }
  return count
}

export function collectDesignTokenUsage(root = process.cwd()) {
  const projectRoot = resolve(root)
  const srcRoot = join(projectRoot, 'src')
  const perFile = []
  const totals = { arbitrary: 0, legacy: 0 }

  for (const file of walk(srcRoot).filter(isScannedFile)) {
    const source = readFileSync(file, 'utf8')
    const arbitrary =
      countMatches(source, ARBITRARY_SIZE_RE, isColorArbitrary) +
      countMatches(source, ARBITRARY_TRACKING_RE)
    const legacy = countMatches(source, LEGACY_TYPE_SCALE_RE)
    if (arbitrary > 0 || legacy > 0) {
      perFile.push({ file: relative(projectRoot, file), arbitrary, legacy })
    }
    totals.arbitrary += arbitrary
    totals.legacy += legacy
  }

  perFile.sort((a, b) => b.arbitrary + b.legacy - (a.arbitrary + a.legacy))
  return { totals, perFile }
}

export function checkDesignTokens({
  root = process.cwd(),
  baseline = DESIGN_TOKEN_BASELINE,
} = {}) {
  const { totals, perFile } = collectDesignTokenUsage(root)
  const failures = []
  const notices = []

  for (const kind of ['arbitrary', 'legacy']) {
    if (totals[kind] > baseline[kind]) {
      failures.push({ kind, actual: totals[kind], baseline: baseline[kind] })
    } else if (totals[kind] < baseline[kind]) {
      notices.push({ kind, actual: totals[kind], baseline: baseline[kind] })
    }
  }

  return { ok: failures.length === 0, totals, baseline, failures, notices, perFile }
}

const LABELS = {
  arbitrary: 'arbitrary values tipográficos (text-[Npx] / tracking-[Xem])',
  legacy: 'aliases legacy de la type scale (text-sm/xs/base/lg/xl/2xl)',
}

function topOffenders(perFile, kind, limit = 8) {
  return perFile
    .filter((entry) => entry[kind] > 0)
    .sort((a, b) => b[kind] - a[kind])
    .slice(0, limit)
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isCli) {
  const result = checkDesignTokens()

  console.log('\nDesign tokens ratchet:')
  console.log('-'.repeat(72))
  for (const kind of ['arbitrary', 'legacy']) {
    const flag = result.totals[kind] > result.baseline[kind] ? ' FAIL' : ''
    console.log(
      `  ${LABELS[kind].padEnd(58)} ${String(result.totals[kind]).padStart(4)}/${
        result.baseline[kind]
      }${flag}`,
    )
  }
  console.log('-'.repeat(72))

  if (!result.ok) {
    console.error(
      '\nEl contrato de design tokens subió respecto al baseline. ' +
        'Usá los tokens semánticos de docs/conventions/design.md ' +
        '(text-body=14px, text-caption=12px, text-micro=10px, text-lead=16px, ' +
        'text-h2=20px, text-h1=32px) en vez de arbitrary values o aliases legacy.\n',
    )
    for (const failure of result.failures) {
      console.error(
        `  - ${LABELS[failure.kind]}: ${failure.actual} > baseline ${failure.baseline}`,
      )
      const offenders = topOffenders(result.perFile, failure.kind)
      for (const entry of offenders) {
        console.error(`      ${entry.file} (${entry[failure.kind]})`)
      }
    }
    console.error('')
    process.exit(1)
  }

  for (const notice of result.notices) {
    console.log(
      `\nBajaste ${LABELS[notice.kind]} a ${notice.actual} (baseline ${notice.baseline}). ` +
        'Actualizá DESIGN_TOKEN_BASELINE en scripts/check-design-tokens.mjs para ' +
        'congelar el nuevo piso.',
    )
  }

  console.log('\ndesign tokens ratchet ok\n')
}
