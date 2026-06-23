import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkModalOverlay, collectModalOverlayUsage } from './check-modal-overlay.mjs'

// Crea un repo mínimo con src/ y un helper para escribir componentes .tsx.
async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), 'trama-modal-overlay-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  function write(relPath, source) {
    const file = join(root, relPath)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, source)
  }
  function remove(relPath) {
    rmSync(join(root, relPath))
  }
  return { root, write, remove }
}

const handRolledDialog = (label) =>
  `export const M = () => <div role="dialog" aria-label="${label}" />`
const adoptedDialog = (label) =>
  [
    "import { useModalOverlay } from '../hooks/useModalOverlay'",
    'export const M = () => {',
    '  const { dialogRef } = useModalOverlay({ open: true, onClose: () => {} })',
    `  return <div ref={dialogRef} role="dialog" aria-label="${label}" />`,
    '}',
  ].join('\n')

describe('checkModalOverlay', () => {
  it('detecta role=dialog/alertdialog (ambas comillas) y si usa el hook', async () => {
    const { root, write } = await makeRepo()
    write('src/Adopted.tsx', adoptedDialog('a'))
    write('src/HandRolled.tsx', handRolledDialog('b'))
    write('src/Alert.tsx', "export const A = () => <div role='alertdialog' />")
    write('src/NotADialog.tsx', 'export const N = () => <div role="toolbar" />')

    const dialogs = collectModalOverlayUsage(root)
    const byFile = new Map(dialogs.map((d) => [d.file, d.usesHook]))

    expect(byFile.size).toBe(3)
    expect(byFile.get('src/Adopted.tsx')).toBe(true)
    expect(byFile.get('src/HandRolled.tsx')).toBe(false)
    expect(byFile.get('src/Alert.tsx')).toBe(false)
    expect(byFile.has('src/NotADialog.tsx')).toBe(false)
  })

  it('excluye archivos de test del escaneo', async () => {
    const { root, write } = await makeRepo()
    write('src/Real.tsx', adoptedDialog('real'))
    write('src/Real.test.tsx', handRolledDialog('test-only'))

    const dialogs = collectModalOverlayUsage(root)

    expect(dialogs.map((d) => d.file)).toEqual(['src/Real.tsx'])
  })

  it('pasa cuando todo es ADOPTED, EXEMPT o PENDING', async () => {
    const { root, write } = await makeRepo()
    write('src/Adopted.tsx', adoptedDialog('a'))
    write('src/Popover.tsx', handRolledDialog('popover'))
    write('src/Legacy.tsx', handRolledDialog('legacy'))

    const result = checkModalOverlay({
      root,
      exempt: new Map([['src/Popover.tsx', 'popover anclado']]),
      pending: new Map([['src/Legacy.tsx', 'deuda conocida']]),
    })

    expect(result.ok).toBe(true)
    expect(result.adopted).toEqual(['src/Adopted.tsx'])
    expect(result.exempt).toEqual(['src/Popover.tsx'])
    expect(result.pending).toEqual(['src/Legacy.tsx'])
    expect(result.failures).toEqual([])
  })

  it('FALLA cuando entra un modal nuevo con role=dialog sin el hook', async () => {
    const { root, write } = await makeRepo()
    write('src/NuevoModal.tsx', handRolledDialog('nuevo'))

    const result = checkModalOverlay({ root, exempt: new Map(), pending: new Map() })

    expect(result.ok).toBe(false)
    expect(result.unclassified).toEqual(['src/NuevoModal.tsx'])
    expect(result.failures).toContainEqual({
      kind: 'unclassified',
      files: ['src/NuevoModal.tsx'],
    })
  })

  it('PASA cuando ese mismo modal usa el hook', async () => {
    const { root, write } = await makeRepo()
    write('src/NuevoModal.tsx', adoptedDialog('nuevo'))

    const result = checkModalOverlay({ root, exempt: new Map(), pending: new Map() })

    expect(result.ok).toBe(true)
    expect(result.adopted).toEqual(['src/NuevoModal.tsx'])
  })

  it('falla con entrada EXEMPT stale (archivo ya sin role=dialog)', async () => {
    const { root, write } = await makeRepo()
    write('src/Popover.tsx', 'export const P = () => <div role="toolbar" />')

    const result = checkModalOverlay({
      root,
      exempt: new Map([['src/Popover.tsx', 'popover anclado']]),
      pending: new Map(),
    })

    expect(result.ok).toBe(false)
    expect(result.staleExempt).toEqual(['src/Popover.tsx'])
  })

  it('falla con entrada PENDING stale (archivo eliminado)', async () => {
    const { root, write, remove } = await makeRepo()
    write('src/Legacy.tsx', handRolledDialog('legacy'))
    remove('src/Legacy.tsx')

    const result = checkModalOverlay({
      root,
      exempt: new Map(),
      pending: new Map([['src/Legacy.tsx', 'deuda conocida']]),
    })

    expect(result.ok).toBe(false)
    expect(result.stalePending).toEqual(['src/Legacy.tsx'])
  })

  it('avisa (sin fallar) cuando un PENDING ya migró al hook', async () => {
    const { root, write } = await makeRepo()
    write('src/Legacy.tsx', adoptedDialog('legacy'))

    const result = checkModalOverlay({
      root,
      exempt: new Map(),
      pending: new Map([['src/Legacy.tsx', 'deuda conocida']]),
    })

    expect(result.ok).toBe(true)
    expect(result.migratedPending).toEqual(['src/Legacy.tsx'])
  })
})
