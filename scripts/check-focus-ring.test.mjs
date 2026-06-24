import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkFocusRings, collectFocusRings } from './check-focus-ring.mjs'

async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), 'trama-focus-ring-'))
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
const cls = (className) => `export const C = () => <button className="${className}" />`

describe('collectFocusRings (detección)', () => {
  it('cuenta una línea con focus-visible:ring (duplica el outline global)', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', cls('rounded focus-visible:ring-2 focus-visible:ring-ink-300'))
    const out = collectFocusRings(root)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ file: 'src/A.tsx', line: 1 })
  })

  it('cuenta focus:outline-none (suprime el outline global)', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', cls('bg-transparent focus:outline-none'))
    expect(collectFocusRings(root)).toHaveLength(1)
  })

  it('NO cuenta ring/outline sin prefijo focus (no compiten con el foco)', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', cls('ring-2 ring-ink-300 outline-none'))
    expect(collectFocusRings(root)).toHaveLength(0)
  })

  it('NO cuenta otras utilidades focus: (bg, text, border)', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', cls('focus:bg-paper-50 focus-visible:text-ink-500'))
    expect(collectFocusRings(root)).toHaveLength(0)
  })

  it('NO cuenta el token .focus-ring / .focus-ring-inset (es el reemplazo sancionado)', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', cls('rounded focus-ring'))
    write('src/B.tsx', cls('overflow-hidden focus-ring-inset'))
    expect(collectFocusRings(root)).toHaveLength(0)
  })

  it('marca exempt:true + razón cuando hay un focus-ring-exempt en la línea de arriba', async () => {
    const { root, write } = await makeRepo()
    write(
      'src/A.tsx',
      ['// focus-ring-exempt: razón documentada', cls('focus:outline-none')].join('\n'),
    )
    const out = collectFocusRings(root)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ exempt: true, reason: 'razón documentada' })
  })

  it('escanea .ts además de .tsx pero excluye tests y .d.ts', async () => {
    const { root, write } = await makeRepo()
    write('src/style.ts', `export const c = 'focus-visible:ring-2'`)
    write('src/A.test.tsx', cls('focus-visible:ring-2'))
    write('src/types.d.ts', `// focus-visible:ring-2`)
    expect(collectFocusRings(root).map((e) => e.file)).toEqual(['src/style.ts'])
  })
})

describe('checkFocusRings (ratchet)', () => {
  it('FALLA si supera el baseline', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', cls('focus-visible:ring-2'))
    const r = checkFocusRings({ root, baseline: 0 })
    expect(r.ok).toBe(false)
    expect(r.failures).toContainEqual({ kind: 'increase', actual: 1, baseline: 0 })
  })

  it('PASA en el baseline y avisa (dropped) por debajo', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', cls('focus-visible:ring-2'))
    expect(checkFocusRings({ root, baseline: 1 }).ok).toBe(true)
    expect(checkFocusRings({ root, baseline: 2 }).dropped).toBe(true)
  })

  it('un marcador focus-ring-exempt en la línea de arriba exime la línea', async () => {
    const { root, write } = await makeRepo()
    write(
      'src/A.tsx',
      [
        'export const C = () => (',
        '  <input',
        '    // focus-ring-exempt: wrapper muestra el foco vía :focus-within',
        '    className="bg-transparent focus:outline-none"',
        '  />',
        ')',
      ].join('\n'),
    )
    const r = checkFocusRings({ root, baseline: 0 })
    expect(r.ok).toBe(true)
    expect(r.count).toBe(0)
    expect(r.exempt).toHaveLength(1)
    expect(r.exempt[0].reason).toBe('wrapper muestra el foco vía :focus-within')
  })

  it('FALLA con un marcador colgante (sin foco horneado debajo)', async () => {
    const { root, write } = await makeRepo()
    write(
      'src/A.tsx',
      [
        'export const C = () => (',
        '  <input',
        '    // focus-ring-exempt: quedó huérfano tras un refactor',
        '    className="bg-paper-50"',
        '  />',
        ')',
      ].join('\n'),
    )
    const r = checkFocusRings({ root, baseline: 0 })
    expect(r.ok).toBe(false)
    expect(r.failures.some((f) => f.kind === 'danglingMarker')).toBe(true)
    expect(r.dangling.map((d) => d.file)).toContain('src/A.tsx')
  })
})
