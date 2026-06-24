import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkFocusRings, collectFocusRings } from './check-focus-ring.mjs'
import {
  checkFormControlLabels,
  collectFormControlLabels,
} from './check-form-control-labels.mjs'
import { checkIconButtons, collectIconButtons } from './check-icon-button.mjs'

// CONTRATO COMPARTIDO de la familia de gates ratchet POR-LÍNEA.
//
// focus-ring, form-control-labels e icon-button detectan cosas distintas (una
// clase de foco, un control sin nombre, un <button> de solo-ícono) pero comparten
// una sola SEMÁNTICA DE EXENCIÓN, en scripts/lib/exempt-marker.mjs:
//   - un marcador `<keyword>: <razón>` con razón en la línea de arriba EXIME;
//   - un marcador pelado (sin razón, incl. el `{/* … */}` cuyo único contenido es
//     el cierre) NO exime — sería un bypass sin justificar;
//   - un marcador sin construcción debajo es COLGANTE y hace fallar el gate.
//
// Esta tabla parametriza un fixture por gate (construcción ofensora + dónde va el
// marcador) y corre las MISMAS aserciones contra los tres. Si un gate nuevo de la
// familia adopta el primitivo pero se desvía del contrato —o alguien rompe el
// primitivo (p. ej. dejando colar un marcador pelado)— estas aserciones lo cazan.

async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), 'trama-marker-contract-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  return {
    root,
    write(relPath, source) {
      const file = join(root, relPath)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, source)
    },
  }
}

const FAMILY = [
  {
    name: 'focus-ring',
    check: checkFocusRings,
    collect: collectFocusRings,
    // construcción ofensora SIN marcador
    offending: [
      'export const C = () => (',
      '  <button',
      '    className="focus:outline-none"',
      '  />',
      ')',
    ],
    // misma construcción, marcador CON razón en la línea de arriba
    exempt: [
      'export const C = () => (',
      '  <button',
      '    // focus-ring-exempt: foco por cambio de borde',
      '    className="focus:outline-none"',
      '  />',
      ')',
    ],
    // marcador pelado (sin razón) sobre la construcción → no debe eximir
    bare: [
      'export const C = () => (',
      '  <button',
      '    // focus-ring-exempt:',
      '    className="focus:outline-none"',
      '  />',
      ')',
    ],
    // marcador CON razón pero SIN construcción debajo → colgante
    dangling: [
      'export const C = () => (',
      '  <button',
      '    // focus-ring-exempt: quedó huérfano',
      '    className="bg-paper-50"',
      '  />',
      ')',
    ],
  },
  {
    name: 'form-control-labels',
    check: checkFormControlLabels,
    collect: collectFormControlLabels,
    offending: [
      'export const C = () => (',
      '  <label>',
      '    <input type="checkbox" />',
      '  </label>',
      ')',
    ],
    exempt: [
      'export const C = () => (',
      '  <label>',
      '    {/* form-control-label-exempt: envuelto por <label> padre */}',
      '    <input type="checkbox" />',
      '  </label>',
      ')',
    ],
    bare: [
      'export const C = () => (',
      '  <label>',
      '    {/* form-control-label-exempt: */}',
      '    <input type="checkbox" />',
      '  </label>',
      ')',
    ],
    dangling: [
      'export const C = () => (',
      '  <label>',
      '    {/* form-control-label-exempt: quedó huérfano */}',
      '    <input id="n" aria-label="ya tiene nombre" />',
      '  </label>',
      ')',
    ],
  },
  {
    name: 'icon-button',
    check: checkIconButtons,
    collect: collectIconButtons,
    offending: [
      'export const C = () => (',
      '  <div>',
      '    <button aria-label="X"><XIcon /></button>',
      '  </div>',
      ')',
    ],
    exempt: [
      'export const C = () => (',
      '  <div>',
      '    {/* icon-button-exempt: caso legítimo que no migra */}',
      '    <button aria-label="X"><XIcon /></button>',
      '  </div>',
      ')',
    ],
    bare: [
      'export const C = () => (',
      '  <div>',
      '    {/* icon-button-exempt: */}',
      '    <button aria-label="X"><XIcon /></button>',
      '  </div>',
      ')',
    ],
    dangling: [
      'export const C = () => (',
      '  <div>',
      '    {/* icon-button-exempt: quedó huérfano */}',
      '    <IconButton label="X"><XIcon /></IconButton>',
      '  </div>',
      ')',
    ],
  },
]

describe('contrato compartido de la familia de gates por-línea (marcador inline)', () => {
  for (const gate of FAMILY) {
    describe(gate.name, () => {
      it('checkX devuelve la forma estándar del ratchet sobre un repo vacío', async () => {
        const { root } = await makeRepo()
        const r = gate.check({ root, baseline: 0 })
        expect(r).toMatchObject({ ok: true, count: 0, baseline: 0, dropped: false })
        expect(Array.isArray(r.failures)).toBe(true)
        expect(Array.isArray(r.exempt)).toBe(true)
        expect(Array.isArray(r.dangling)).toBe(true)
      })

      it('cuenta la construcción ofensora y la reporta como {file, line, exempt:false}', async () => {
        const { root, write } = await makeRepo()
        write('src/A.tsx', gate.offending.join('\n'))
        const r = gate.check({ root, baseline: 0 })
        expect(r.ok).toBe(false)
        expect(r.count).toBe(1)
        expect(r.failures).toContainEqual({ kind: 'increase', actual: 1, baseline: 0 })
        const entry = gate.collect(root)[0]
        expect(entry).toMatchObject({ file: 'src/A.tsx', exempt: false })
        expect(typeof entry.line).toBe('number')
      })

      it('un marcador CON razón en la línea de arriba exime (con razón legible)', async () => {
        const { root, write } = await makeRepo()
        write('src/A.tsx', gate.exempt.join('\n'))
        const r = gate.check({ root, baseline: 0 })
        expect(r.ok).toBe(true)
        expect(r.count).toBe(0)
        expect(r.exempt).toHaveLength(1)
        expect(r.exempt[0].reason.length).toBeGreaterThan(0)
      })

      it('un marcador PELADO (sin razón) NO exime', async () => {
        const { root, write } = await makeRepo()
        write('src/A.tsx', gate.bare.join('\n'))
        const r = gate.check({ root, baseline: 0 })
        expect(r.ok).toBe(false)
        expect(r.count).toBe(1)
      })

      it('un marcador sin construcción debajo es COLGANTE y hace fallar el gate', async () => {
        const { root, write } = await makeRepo()
        write('src/A.tsx', gate.dangling.join('\n'))
        const r = gate.check({ root, baseline: 0 })
        expect(r.ok).toBe(false)
        expect(r.dangling.length).toBeGreaterThan(0)
        expect(r.failures.some((f) => f.kind === 'danglingMarker')).toBe(true)
      })
    })
  }
})
