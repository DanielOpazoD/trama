import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkMockCompleteness } from './check-mock-completeness.mjs'

/**
 * Un repo mínimo: un módulo con exports, un sujeto que importa de él, y un test
 * que lo mockea. Suficiente para ejercitar la regla completa.
 */
async function makeRepo({ moduleSrc, subjectSrc, testSrc }) {
  const root = await mkdtemp(join(tmpdir(), 'trama-mock-completeness-'))
  await mkdir(join(root, 'netlify/functions/_lib'), { recursive: true })
  await writeFile(join(root, 'netlify/functions/_lib/target.ts'), moduleSrc)
  await writeFile(join(root, 'netlify/functions/subject.mts'), subjectSrc)
  await writeFile(join(root, 'netlify/functions/_lib/subject.test.ts'), testSrc)
  return root
}

const MODULE = `
export function usada() {}
export function otra() {}
export type SoloTipo = { a: number }
`

describe('checkMockCompleteness', () => {
  it('reporta lo que el sujeto importa y el mock no provee', async () => {
    const root = await makeRepo({
      moduleSrc: MODULE,
      subjectSrc: `import { usada, otra } from './_lib/target.js'\nexport default () => [usada, otra]\n`,
      testSrc: `vi.mock('./target.js', () => ({ usada }))\nimport handler from '../subject'\n`,
    })
    const { failures } = checkMockCompleteness(root)
    expect(failures).toHaveLength(1)
    expect(failures[0].missing).toEqual(['otra'])
  })

  it('no exige completitud: lo que el sujeto no usa, no hace falta', async () => {
    const root = await makeRepo({
      moduleSrc: MODULE,
      subjectSrc: `import { usada } from './_lib/target.js'\nexport default () => usada\n`,
      testSrc: `vi.mock('./target.js', () => ({ usada }))\nimport handler from '../subject'\n`,
    })
    expect(checkMockCompleteness(root).failures).toHaveLength(0)
  })

  /**
   * Los `export type` desaparecen al compilar, así que un mock no tiene por qué
   * proveerlos aunque el sujeto los importe sin la palabra `type`. Fue el 100%
   * de los falsos positivos de la primera versión del gate.
   */
  it('ignora los tipos, aunque se importen sin `import type`', async () => {
    const root = await makeRepo({
      moduleSrc: MODULE,
      subjectSrc: `import { usada, SoloTipo } from './_lib/target.js'\nexport default (x: SoloTipo) => usada\n`,
      testSrc: `vi.mock('./target.js', () => ({ usada }))\nimport handler from '../subject'\n`,
    })
    expect(checkMockCompleteness(root).failures).toHaveLength(0)
  })

  /**
   * Contar llaves y comas sobre el texto crudo se rompe con una coma dentro de
   * una cadena: la propiedad se parte y la clave desaparece del análisis, así
   * que el gate la reporta como faltante sin serlo.
   */
  it('no se confunde con comas ni llaves dentro de cadenas y comentarios', async () => {
    const root = await makeRepo({
      moduleSrc: MODULE,
      subjectSrc: `import { usada, otra } from './_lib/target.js'\nexport default () => [usada, otra]\n`,
      testSrc: [
        `vi.mock('./target.js', () => ({`,
        `  // un comentario con { llave y , coma`,
        `  usada: () => 'Sí, continuar',`,
        `  otra: () => \`plantilla con } y ,\`,`,
        `}))`,
        `import handler from '../subject'`,
      ].join('\n'),
    })
    expect(checkMockCompleteness(root).failures).toHaveLength(0)
  })

  /**
   * `import Def, { a } from '…'` es un sujeto válido; si el regex de imports no
   * lo reconoce, el uso queda invisible y un mock incompleto pasa sin avisar.
   * Falso negativo, que en un gate es peor que un falso positivo.
   */
  it('ve los imports mixtos default + nombrados', async () => {
    const root = await makeRepo({
      moduleSrc: `export function usada() {}\nexport function otra() {}\nexport default function principal() {}\n`,
      subjectSrc: `import principal, { usada, otra } from './_lib/target.js'\nexport default () => [principal, usada, otra]\n`,
      testSrc: `vi.mock('./target.js', () => ({ usada }))\nimport handler from '../subject'\n`,
    })
    const { failures } = checkMockCompleteness(root)
    expect(failures).toHaveLength(1)
    expect(failures[0].missing).toEqual(['otra'])
  })

  it('deja fuera los factories con spread: ya cubren todo', async () => {
    const root = await makeRepo({
      moduleSrc: MODULE,
      subjectSrc: `import { usada, otra } from './_lib/target.js'\nexport default () => [usada, otra]\n`,
      testSrc: `vi.mock('./target.js', () => ({ ...actual, usada }))\nimport handler from '../subject'\n`,
    })
    const { failures, skipped } = checkMockCompleteness(root)
    expect(failures).toHaveLength(0)
    expect(skipped.get('factory con spread')).toBe(1)
  })
})
