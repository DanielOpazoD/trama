#!/usr/bin/env node

/**
 * Falla si una dependencia de PRODUCCIÓN tiene un aviso de severidad alta o
 * crítica que no esté explícitamente aceptado acá abajo.
 *
 * Por qué existe: hasta agosto de 2026 nada en CI miraba la cadena de
 * suministro. Se acumularon doce avisos, seis altos, y uno de ellos era
 * ejecución arbitraria de JavaScript al abrir un PDF (GHSA-hq66-cqwq-w95j) en
 * una aplicación cuya función central es abrir PDFs. Ninguno era conocido: no
 * es que se hubieran decidido, es que nadie preguntaba.
 *
 * Sólo mira `--omit=dev`. Un aviso en una herramienta de build no llega al
 * navegador del usuario y no debe bloquear un merge; si algún día importa, se
 * revisa a mano.
 *
 * Aceptar un aviso NO es marcar una casilla: hay que escribir por qué el riesgo
 * está acotado. Si no se puede escribir, no está acotado.
 */

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/**
 * Avisos aceptados a conciencia, por paquete y por IDENTIFICADOR de aviso.
 *
 * Anclar en el identificador y no en el paquete es lo que hace que esto sirva:
 * una excepción para `xlsx` escrita pensando en contaminación de prototipo no
 * puede convertirse en un salvoconducto para el próximo agujero de `xlsx`, que
 * será otra cosa y nadie habrá evaluado. Un GHSA nuevo bloquea aunque el paquete
 * ya figure acá.
 *
 * `reason` tiene que explicar qué hace que el riesgo sea tolerable HOY, no
 * prometer un arreglo futuro.
 */
export const ACCEPTED_ADVISORIES = new Map([
  [
    'xlsx',
    {
      advisories: ['GHSA-4r6h-8v6p-xvw6', 'GHSA-5pgg-2g8v-p4x9'],
      reason:
        'Contaminación de prototipo (GHSA-4r6h-8v6p-xvw6) y ReDoS (GHSA-5pgg-2g8v-p4x9) sin parche publicado. ' +
        'El parseo corre dentro de un Worker de un solo uso (src/lib/biblioteca/officeParse.worker.ts) ' +
        'con temporizador: la contaminación queda en un realm que se termina al devolver el resultado, ' +
        'y un ReDoS cuelga un hilo desechable en vez de la interfaz. No hay fallback al hilo principal.',
    },
  ],
])

const BLOCKING = new Set(['high', 'critical'])

/** `GHSA-xxxx-...` de una URL de aviso; si no hay, el id numérico de npm. */
function advisoryId(via) {
  const fromUrl = /GHSA-[0-9a-z-]+/i.exec(via.url ?? '')
  if (fromUrl) return fromUrl[0]
  return via.source ? `npm-${via.source}` : 'desconocido'
}

/**
 * Identificadores de aviso de un paquete. `via` mezcla objetos (el aviso en sí)
 * con strings (el nombre del paquete por el que le llega), así que hay que
 * seguir esas cadenas hasta el aviso real. `seen` corta las referencias
 * circulares que aparecen entre dependencias transitivas.
 */
function collectIds(name, vulnerabilities, seen = new Set()) {
  if (seen.has(name)) return []
  seen.add(name)
  const entry = vulnerabilities[name]
  if (!entry) return []
  const ids = []
  for (const via of entry.via ?? []) {
    if (typeof via === 'string') ids.push(...collectIds(via, vulnerabilities, seen))
    else ids.push(advisoryId(via))
  }
  return ids
}

export function readProductionAdvisories(runner = defaultRunner) {
  const raw = runner()
  let report
  try {
    report = JSON.parse(raw)
  } catch {
    throw new Error('npm audit no devolvió JSON interpretable')
  }
  const vulnerabilities = report.vulnerabilities ?? {}
  return Object.entries(vulnerabilities).map(([name, entry]) => ({
    name,
    severity: entry.severity,
    fixAvailable: Boolean(entry.fixAvailable),
    ids: [...new Set(collectIds(name, vulnerabilities))],
  }))
}

function defaultRunner() {
  try {
    return execFileSync('npm', ['audit', '--omit=dev', '--json'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch (error) {
    // `npm audit` sale con código != 0 cuando encuentra algo: eso es normal y
    // el JSON viene igual en stdout.
    if (error?.stdout) return error.stdout
    throw error
  }
}

export function evaluateAdvisories(advisories, accepted = ACCEPTED_ADVISORIES) {
  const blocking = []
  const tolerated = []
  for (const advisory of advisories) {
    if (!BLOCKING.has(advisory.severity)) continue
    const entry = accepted.get(advisory.name)
    const ids = advisory.ids ?? []
    // Sin identificadores no se puede saber QUÉ se está aceptando, así que no
    // se acepta: es preferible un falso bloqueo a una exención a ciegas.
    const unreviewed = entry
      ? ids.length === 0
        ? ['(aviso sin identificador)']
        : ids.filter((id) => !entry.advisories.includes(id))
      : ids
    if (entry && unreviewed.length === 0) {
      tolerated.push({ ...advisory, reason: entry.reason })
      continue
    }
    blocking.push({ ...advisory, unreviewed, hasEntry: Boolean(entry) })
  }
  // Una excepción que ya no hace falta es ruido que envejece mal.
  const names = new Set(advisories.map((advisory) => advisory.name))
  const stale = [...accepted.keys()].filter((name) => !names.has(name))
  return { blocking, tolerated, stale }
}

function main() {
  const { blocking, tolerated, stale } = evaluateAdvisories(readProductionAdvisories())

  for (const advisory of tolerated) {
    console.log(`· ${advisory.name} (${advisory.severity}) aceptado`)
    console.log(`  ${advisory.reason}`)
  }
  for (const name of stale) {
    console.log(`· ${name} ya no tiene aviso: quita su excepción de este script.`)
  }

  if (blocking.length === 0) {
    console.log(
      `\n✅ Sin avisos altos o críticos sin aceptar en dependencias de producción.`,
    )
    return
  }

  console.error('\n❌ Avisos de severidad alta o crítica sin aceptar:\n')
  for (const advisory of blocking) {
    console.error(
      `  ${advisory.name} · ${advisory.severity} · ${
        advisory.fixAvailable ? 'HAY PARCHE: npm audit fix' : 'sin parche publicado'
      }`,
    )
    console.error(`    sin evaluar: ${advisory.unreviewed.join(', ')}`)
    if (advisory.hasEntry) {
      console.error(
        '    (el paquete ya tiene excepción, pero ESTE aviso es otro y nadie lo evaluó)',
      )
    }
  }
  console.error(
    '\nSi hay parche, aplicalo. Si no lo hay, acota el riesgo y escribí por qué\n' +
      'en ACCEPTED_ADVISORIES de scripts/check-deps-advisories.mjs.',
  )
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
