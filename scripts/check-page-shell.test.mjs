import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkPageShell, collectPageColumns } from './check-page-shell.mjs'

async function repo() {
  const root = await mkdtemp(join(tmpdir(), 'trama-page-shell-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  const write = (rel, source) => {
    const file = join(root, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, source)
  }
  return { root, write }
}

const aMano = (w = 'max-w-3xl') =>
  `export const V = () => <div className="mx-auto ${w} px-8 py-10">x</div>`
const adoptada = `import { Page } from './Page'
export const V = () => <Page width="reading">x</Page>`

describe('checkPageShell', () => {
  it('detecta la columna a mano y NO cuenta como tal la que adoptó Page', async () => {
    const { root, write } = await repo()
    write('src/AMano.tsx', aMano())
    write('src/Adoptada.tsx', adoptada)
    write(
      'src/Suelto.tsx',
      'export const S = () => <div className="mx-auto max-w-3xl">x</div>',
    )

    const { aMano: columnas, adoptantes } = collectPageColumns(root)
    expect(columnas.map((c) => c.file)).toEqual(['src/AMano.tsx'])
    expect(adoptantes).toEqual(['src/Adoptada.tsx'])
  })

  it('adoptar Page borra el patrón, así que el adoptante se cuenta aparte', async () => {
    const { root, write } = await repo()
    write('src/Adoptada.tsx', adoptada)
    const r = checkPageShell({ root, exempt: new Map(), pending: new Map() })
    expect(r.adopted).toEqual(['src/Adoptada.tsx'])
    expect(r.failures).toBeNull()
  })

  it('una columna nueva sin clasificar falla y se nombra', async () => {
    const { root, write } = await repo()
    write('src/Nueva.tsx', aMano())
    const r = checkPageShell({ root, exempt: new Map(), pending: new Map() })
    expect(r.unclassified).toEqual(['src/Nueva.tsx'])
    expect(r.failures).not.toBeNull()
  })

  it('exento y pendiente pasan cuando existen', async () => {
    const { root, write } = await repo()
    write('src/Overlay.tsx', aMano())
    write('src/Vieja.tsx', aMano())
    const r = checkPageShell({
      root,
      exempt: new Map([['src/Overlay.tsx', 'overlay a pantalla completa']]),
      pending: new Map([['src/Vieja.tsx', 'migra en el PR siguiente']]),
    })
    expect(r.exempt).toEqual(['src/Overlay.tsx'])
    expect(r.pending).toEqual(['src/Vieja.tsx'])
    expect(r.failures).toBeNull()
  })

  it('una entrada que ya migró deja de valer: el trinquete corre en los dos sentidos', async () => {
    const { root, write } = await repo()
    write('src/Vieja.tsx', adoptada)
    const r = checkPageShell({
      root,
      exempt: new Map(),
      pending: new Map([['src/Vieja.tsx', 'ya migró; la entrada sobra']]),
    })
    expect(r.stalePending).toEqual(['src/Vieja.tsx'])
    expect(r.failures).not.toBeNull()
  })

  it('una exención cuyo archivo ya no declara columna también falla', async () => {
    const { root, write } = await repo()
    write('src/Limpio.tsx', 'export const L = () => <p>sin columna</p>')
    const r = checkPageShell({
      root,
      exempt: new Map([['src/Limpio.tsx', 'motivo viejo']]),
      pending: new Map(),
    })
    expect(r.staleExempt).toEqual(['src/Limpio.tsx'])
  })

  it('el repo real pasa el trinquete', () => {
    expect(checkPageShell().failures).toBeNull()
  })
})
