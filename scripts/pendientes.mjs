#!/usr/bin/env node
/**
 * Registro de pendientes: junta en un solo archivo lo que cada plan dejó
 * abierto en su sección «## Pendiente».
 *
 * POR QUÉ EXISTE
 *
 * Cada pack termina con una nota en `docs/superpowers/plans/` y la nota cierra
 * con «## Pendiente»: la deuda que el autor conocía y decidió no pagar en ese
 * PR. Es la lista más honesta de trabajo abierto que tiene el repo, y estaba
 * repartida en una docena de archivos que nadie vuelve a abrir. Cada
 * evaluación la redescubría a mano.
 *
 * `docs/pendientes.md` es la vista agregada. Se GENERA desde los planes; la
 * fuente de verdad sigue siendo cada nota. Para cerrar un pendiente se edita el
 * plan de origen (se quita o se marca como resuelto) y se regenera.
 *
 * USO
 *   node scripts/pendientes.mjs           # escribe docs/pendientes.md
 *   node scripts/pendientes.mjs --check   # falla si el archivo está desactualizado
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Igual que el resto de scripts del repo: la raíz es el cwd, no la ubicación
// del archivo. Así funciona tanto desde `npm run` como copiado por vitest.
const ROOT = resolve(process.cwd())
export const PLANS_DIR = 'docs/superpowers/plans'
export const OUTPUT_FILE = 'docs/pendientes.md'

const SECTION_RE = /^## Pendiente/i
const HEADING_RE = /^#{1,6}\s/
const BULLET_RE = /^- /
const PRIORITY_RE = /^\[alto\]/i
const RESOLVED_RE = /\b(resuelto|cerrado|hecho)\b/i

/**
 * Extrae los ítems de la sección «## Pendiente» de un plan. Un ítem empieza
 * con `- ` y sigue en las líneas indentadas que vienen debajo. Un ítem que
 * se marcó como resuelto/cerrado/hecho se omite: el autor ya lo pagó y lo
 * dijo en la nota.
 */
export function parsePlan(markdown, fileName) {
  const lines = markdown.split('\n')
  const title = (lines.find((line) => line.startsWith('# ')) ?? '')
    .replace(/^#\s*/, '')
    .trim()
  const date = fileName.slice(0, 10)
  const items = []
  let inSection = false
  for (const line of lines) {
    if (SECTION_RE.test(line)) {
      inSection = true
      continue
    }
    if (!inSection) continue
    if (HEADING_RE.test(line)) break
    if (BULLET_RE.test(line)) {
      items.push(line.slice(2).trim())
    } else if (items.length > 0 && /^\s+\S/.test(line)) {
      items[items.length - 1] += ` ${line.trim()}`
    }
  }
  const vivos = items.filter((item) => !RESOLVED_RE.test(item))
  // Un pendiente marcado «[alto]» al principio va primero dentro de su plan:
  // no todos pesan lo mismo y el registro debe decirlo sin inventar ranking.
  const altos = vivos.filter((item) => PRIORITY_RE.test(item))
  const resto = vivos.filter((item) => !PRIORITY_RE.test(item))
  return {
    file: fileName,
    title: title || fileName,
    date,
    items: [...altos, ...resto],
  }
}

export function isHighPriority(item) {
  return PRIORITY_RE.test(item)
}

export function collectPendientes(root = ROOT) {
  const dir = join(root, PLANS_DIR)
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .reverse()
    .map((name) => parsePlan(readFileSync(join(dir, name), 'utf8'), name))
    .filter((plan) => plan.items.length > 0)
}

export function renderPendientes(plans) {
  const total = plans.reduce((sum, plan) => sum + plan.items.length, 0)
  const altos = plans.reduce(
    (sum, plan) => sum + plan.items.filter((item) => isHighPriority(item)).length,
    0,
  )
  const out = [
    '# Pendientes declarados',
    '',
    '<!-- GENERADO por `npm run pendientes`. No editar a mano: la fuente es la',
    'sección «## Pendiente» de cada plan en docs/superpowers/plans/. Para cerrar',
    'uno, edita el plan de origen (quítalo o márcalo como resuelto) y regenera. -->',
    '',
    `**${total} pendientes** en ${plans.length} planes${altos > 0 ? `, ${altos} marcados «[alto]»` : ''}. Del más reciente al más viejo; dentro de cada plan, los «[alto]» primero.`,
    '',
  ]
  for (const plan of plans) {
    out.push(`## ${plan.date} · ${plan.title}`, '')
    out.push(`Plan: [${plan.file}](superpowers/plans/${plan.file})`, '')
    for (const item of plan.items) out.push(`- ${item}`)
    out.push('')
  }
  return out.join('\n')
}

function main() {
  const check = process.argv.includes('--check')
  const rendered = renderPendientes(collectPendientes())
  const target = join(ROOT, OUTPUT_FILE)
  if (!check) {
    writeFileSync(target, rendered)
    console.log(`${OUTPUT_FILE} escrito.`)
    return
  }
  let current
  try {
    current = readFileSync(target, 'utf8')
  } catch {
    current = ''
  }
  if (current === rendered) {
    console.log(`${OUTPUT_FILE} al día.`)
    return
  }
  console.error(
    `${OUTPUT_FILE} está desactualizado respecto a los planes.\n` +
      'Regenéralo con `npm run pendientes` y súbelo en el mismo PR.',
  )
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
