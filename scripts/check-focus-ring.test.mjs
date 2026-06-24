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

  it('escanea .ts además de .tsx pero excluye tests y .d.ts', async () => {
    const { root, write } = await makeRepo()
    write('src/style.ts', `export const c = 'focus-visible:ring-2'`)
    write('src/A.test.tsx', cls('focus-visible:ring-2'))
    write('src/types.d.ts', `// focus-visible:ring-2`)
    expect(collectFocusRings(root).map((e) => e.file)).toEqual(['src/style.ts'])
  })
})

describe('checkFocusRings (ratchet)', () => {
  const noExempt = new Map()
  it('FALLA si supera el baseline', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', cls('focus-visible:ring-2'))
    const r = checkFocusRings({ root, baseline: 0, exempt: noExempt })
    expect(r.ok).toBe(false)
    expect(r.failures).toContainEqual({ kind: 'increase', actual: 1, baseline: 0 })
  })

  it('PASA en el baseline y avisa (dropped) por debajo', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', cls('focus-visible:ring-2'))
    expect(checkFocusRings({ root, baseline: 1, exempt: noExempt }).ok).toBe(true)
    expect(checkFocusRings({ root, baseline: 2, exempt: noExempt }).dropped).toBe(true)
  })

  it('una línea EXEMPT no cuenta como ofensora', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', cls('focus:outline-none'))
    const exempt = new Map([['src/A.tsx:1', 'wrapper input-paper']])
    expect(checkFocusRings({ root, baseline: 0, exempt }).ok).toBe(true)
  })

  it('FALLA con entrada EXEMPT stale', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', cls('focus-visible:ring-2'))
    const exempt = new Map([['src/Nope.tsx:9', 'vieja']])
    const r = checkFocusRings({ root, baseline: 1, exempt })
    expect(r.ok).toBe(false)
    expect(r.staleExempt).toEqual(['src/Nope.tsx:9'])
  })
})
