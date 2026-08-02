/**
 * Los ADR no se pierden ni comparten número.
 *
 * Este gate existe porque las dos cosas pasaron de verdad:
 *
 *   - `0011-multiuser-operational-observability.md` (PR #249) y
 *     `0011-legacy-identity-cutover.md` (PR #260) compartieron el número 0011.
 *   - El primero, además, nunca entró al índice: existió seis semanas en el
 *     repositorio sin figurar en ninguna lista. Un ADR que nadie encuentra no
 *     cumple su función —ser la respuesta a «¿por qué hicieron X?»—, así que
 *     era como no haberlo escrito.
 *
 * Ninguna revisión humana caza esto: el fichero está ahí, el índice se ve bien,
 * y sólo se nota si alguien ordena el directorio y mira los números.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'docs/adr'
const INDICE = join(DIR, 'README.md')

export function checkAdrIndex(cwd = process.cwd()) {
  const problemas = []

  const ficheros = readdirSync(join(cwd, DIR))
    .filter((f) => /^\d{4}-.+\.md$/.test(f))
    .sort()
  const indice = readFileSync(join(cwd, INDICE), 'utf8')

  // 1. Números únicos.
  const porNumero = new Map()
  for (const fichero of ficheros) {
    const numero = fichero.slice(0, 4)
    const previos = porNumero.get(numero) ?? []
    porNumero.set(numero, [...previos, fichero])
  }
  for (const [numero, grupo] of porNumero) {
    if (grupo.length > 1) {
      problemas.push(
        `ADR ${numero} usado por ${grupo.length} ficheros: ${grupo.join(', ')}`,
      )
    }
  }

  // 2. Todos en el índice.
  for (const fichero of ficheros) {
    if (!indice.includes(fichero)) {
      problemas.push(
        `${fichero} no aparece en ${INDICE} — un ADR que nadie encuentra no sirve`,
      )
    }
  }

  // 3. El índice no apunta a ficheros que no existen.
  for (const enlazado of indice.matchAll(/\]\(\.\/(\d{4}-[^)]+\.md)\)/g)) {
    const destino = enlazado[1]
    if (destino && !ficheros.includes(destino)) {
      problemas.push(`${INDICE} enlaza a ${destino}, que no existe`)
    }
  }

  return { problemas, total: ficheros.length }
}

const esEntrada = process.argv[1]?.endsWith('check-adr-index.mjs')
if (esEntrada) {
  const { problemas, total } = checkAdrIndex()
  if (problemas.length > 0) {
    console.error('✗ Índice de ADR inconsistente:\n')
    for (const p of problemas) console.error(`  - ${p}`)
    console.error('\nCada ADR necesita un número libre y una fila en docs/adr/README.md.')
    process.exit(1)
  }
  console.log(`✅ ${total} ADR con número único y presentes en el índice.`)
}
