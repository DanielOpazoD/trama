import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkModalShell,
  MODAL_SHELL_EXEMPT,
  MODAL_SHELL_PENDING,
} from './check-modal-shell.mjs'

async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), 'trama-modal-shell-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  function write(relPath, source) {
    const file = join(root, relPath)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, source)
  }
  return { root, write }
}

const handRolled = (label) =>
  `export const M = () => <div role="dialog" aria-label="${label}" />`
const adopted = (label) =>
  [
    "import { ModalShell } from '../ModalShell'",
    `export const M = () => <ModalShell ariaLabel="${label}" onClose={() => {}}>x</ModalShell>`,
  ].join('\n')

describe('checkModalShell', () => {
  it('un diálogo nuevo que copia el cromo a mano hace fallar el gate', async () => {
    const { root, write } = await makeRepo()
    write('src/Adopted.tsx', adopted('a'))
    write('src/HandRolled.tsx', handRolled('b'))
    const result = checkModalShell({ root, exempt: new Map(), pending: new Map() })
    expect(result.adopted).toEqual(['src/Adopted.tsx'])
    expect(result.unclassified).toEqual(['src/HandRolled.tsx'])
    expect(result.ok).toBe(false)
  })

  it('clasificado como exento o pendiente pasa; una entrada que ya migró es stale', async () => {
    const { root, write } = await makeRepo()
    write('src/Lightbox.tsx', handRolled('l'))
    write('src/Pending.tsx', handRolled('p'))
    write('src/Migrated.tsx', adopted('m'))
    const ok = checkModalShell({
      root,
      exempt: new Map([['src/Lightbox.tsx', 'lightbox']]),
      pending: new Map([['src/Pending.tsx', 'caja']]),
    })
    expect(ok.ok).toBe(true)
    const stale = checkModalShell({
      root,
      exempt: new Map([['src/Lightbox.tsx', 'lightbox']]),
      pending: new Map([
        ['src/Pending.tsx', 'caja'],
        ['src/Migrated.tsx', 'ya migró'],
        ['src/Borrado.tsx', 'no existe'],
      ]),
    })
    expect(stale.stalePending.sort()).toEqual(['src/Borrado.tsx', 'src/Migrated.tsx'])
    expect(stale.ok).toBe(false)
  })

  it('las listas reales describen el repo: nada stale ni sin clasificar', () => {
    const result = checkModalShell()
    expect(result.failures).toEqual([])
    expect(result.adopted.length).toBeGreaterThanOrEqual(6)
    for (const [file, reason] of [...MODAL_SHELL_EXEMPT, ...MODAL_SHELL_PENDING]) {
      expect(reason.length, file).toBeGreaterThan(12)
    }
  })
})
