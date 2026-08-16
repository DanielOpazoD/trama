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
 * Avisos aceptados a conciencia, por paquete. `reason` tiene que explicar qué
 * hace que el riesgo sea tolerable HOY, no prometer un arreglo futuro.
 */
export const ACCEPTED_ADVISORIES = new Map([
  [
    'xlsx',
    {
      severities: ['high'],
      reason:
        'Contaminación de prototipo (GHSA-4r6h-8v6p-xvw6) y ReDoS (GHSA-5pgg-2g8v-p4x9) sin parche publicado. ' +
        'El parseo corre dentro de un Worker de un solo uso (src/lib/biblioteca/officeSheets.worker.ts) ' +
        'con temporizador: la contaminación queda en un realm que se termina al devolver el resultado, ' +
        'y un ReDoS cuelga un hilo desechable en vez de la interfaz. No hay fallback al hilo principal.',
    },
  ],
])

const BLOCKING = new Set(['high', 'critical'])

export function readProductionAdvisories(runner = defaultRunner) {
  const raw = runner()
  let report
  try {
    report = JSON.parse(raw)
  } catch {
    throw new Error('npm audit no devolvió JSON interpretable')
  }
  return Object.entries(report.vulnerabilities ?? {}).map(([name, entry]) => ({
    name,
    severity: entry.severity,
    fixAvailable: Boolean(entry.fixAvailable),
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
    if (entry && entry.severities.includes(advisory.severity)) {
      tolerated.push({ ...advisory, reason: entry.reason })
      continue
    }
    blocking.push(advisory)
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
