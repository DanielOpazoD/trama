import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkIconButtons, collectIconButtons } from './check-icon-button.mjs'

async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), 'trama-icon-button-'))
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
const comp = (body) => `export const C = () => (${body})`

describe('collectIconButtons (detección precisa)', () => {
  it('cuenta un <button> cuyo contenido es exactamente un ícono', async () => {
    const { root, write } = await makeRepo()
    write(
      'src/A.tsx',
      comp('<button aria-label="Cerrar"><CloseIcon size={14} /></button>'),
    )
    const out = collectIconButtons(root)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ file: 'src/A.tsx', line: 1 })
  })

  it('NO cuenta botones con texto (incluido ícono + texto dinámico)', async () => {
    const { root, write } = await makeRepo()
    write('src/Text.tsx', comp('<button>Guardar</button>'))
    write('src/IconText.tsx', comp('<button><Icon /><span>{label}</span></button>'))
    expect(collectIconButtons(root)).toHaveLength(0)
  })

  it('NO cuenta <button> self-closing (backdrop sin children)', async () => {
    const { root, write } = await makeRepo()
    write('src/Backdrop.tsx', comp('<button aria-label="Cerrar" onClick={onClose} />'))
    expect(collectIconButtons(root)).toHaveLength(0)
  })

  it('NO cuenta usos de <IconButton> (no son <button> crudos)', async () => {
    const { root, write } = await makeRepo()
    write('src/Ok.tsx', comp('<IconButton label="Cerrar"><CloseIcon /></IconButton>'))
    expect(collectIconButtons(root)).toHaveLength(0)
  })

  it('tolera handlers con `>` dentro de {} en el tag de apertura', async () => {
    const { root, write } = await makeRepo()
    write(
      'src/Arrow.tsx',
      comp('<button onClick={() => go(a > b)} aria-label="X"><XIcon /></button>'),
    )
    expect(collectIconButtons(root)).toHaveLength(1)
  })

  it('excluye archivos *.test.tsx', async () => {
    const { root, write } = await makeRepo()
    write('src/Real.tsx', comp('<button aria-label="X"><XIcon /></button>'))
    write('src/Real.test.tsx', comp('<button aria-label="X"><XIcon /></button>'))
    expect(collectIconButtons(root).map((e) => e.file)).toEqual(['src/Real.tsx'])
  })
})

describe('checkIconButtons (ratchet)', () => {
  const noExempt = new Map()
  it('FALLA si supera el baseline', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', comp('<button aria-label="X"><XIcon /></button>'))
    const r = checkIconButtons({ root, baseline: 0, exempt: noExempt })
    expect(r.ok).toBe(false)
    expect(r.failures).toContainEqual({ kind: 'increase', actual: 1, baseline: 0 })
  })

  it('PASA en el baseline y avisa (dropped) por debajo', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', comp('<button aria-label="X"><XIcon /></button>'))
    expect(checkIconButtons({ root, baseline: 1, exempt: noExempt }).ok).toBe(true)
    expect(checkIconButtons({ root, baseline: 2, exempt: noExempt }).dropped).toBe(true)
  })

  it('FALLA con entrada EXEMPT stale', async () => {
    const { root, write } = await makeRepo()
    write('src/A.tsx', comp('<button aria-label="X"><XIcon /></button>'))
    const exempt = new Map([['src/Nope.tsx:9', 'vieja']])
    const r = checkIconButtons({ root, baseline: 1, exempt })
    expect(r.ok).toBe(false)
    expect(r.staleExempt).toEqual(['src/Nope.tsx:9'])
  })
})
