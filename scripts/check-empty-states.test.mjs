import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMPONENTES_CON_SALIDA,
  checkEmptyStates,
  recogerVacios,
  textoDelElemento,
  tieneSalida,
} from './check-empty-states.mjs'

async function repo() {
  const root = await mkdtemp(join(tmpdir(), 'trama-empty-states-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  const write = (rel, source) => {
    const file = join(root, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, source)
  }
  return { root, write }
}

const callejon = `export const V = () => <EmptyMessage title="Nada" body="solo texto" />`
const conAccion = `export const V = () => <EmptyMessage title="Nada" action={<button>Crear</button>} />`

describe('check-empty-states', () => {
  it('lee el elemento entero aunque haya > dentro de comillas o de llaves', () => {
    const fuente = `<EmptyMessage title="a > b" action={<button>x</button>} />`
    expect(textoDelElemento(fuente, 0)).toBe(fuente)
  })

  it('cuenta como salida action, hint, un botón dentro del body o un onClick', () => {
    expect(tieneSalida('EmptyMessage', '<EmptyMessage title="x" action={<b />} />')).toBe(
      true,
    )
    expect(tieneSalida('EmptyMessage', '<EmptyMessage title="x" hint="y" />')).toBe(true)
    expect(
      tieneSalida(
        'EmptyMessage',
        '<EmptyMessage body={<><button onClick={f}>y</button></>} />',
      ),
    ).toBe(true)
    expect(
      tieneSalida('EmptyMessage', '<EmptyMessage title="x" body="solo texto" />'),
    ).toBe(false)
  })

  it('cuenta por archivo: total y cuántos no ofrecen salida', async () => {
    const { root, write } = await repo()
    write('src/A.tsx', `${callejon}\n${conAccion}`)
    write('src/B.tsx', conAccion)
    const vacios = recogerVacios(root)
    expect(vacios.get('src/A.tsx')).toEqual({ total: 2, sinSalida: 1 })
    expect(vacios.get('src/B.tsx')).toEqual({ total: 1, sinSalida: 0 })
  })

  it('un callejón en un archivo sin admitir falla y se nombra', async () => {
    const { root, write } = await repo()
    write('src/Nuevo.tsx', callejon)
    const r = checkEmptyStates({ root, admitidos: new Map() })
    expect(r.exceden).toEqual([{ archivo: 'src/Nuevo.tsx', sinSalida: 1, permitido: 0 }])
    expect(r.failures).not.toBeNull()
  })

  it('admitido con su motivo, pasa', async () => {
    const { root, write } = await repo()
    write('src/Viejo.tsx', callejon)
    const r = checkEmptyStates({
      root,
      admitidos: new Map([
        ['src/Viejo.tsx', { n: 1, motivo: 'la acción vive fuera de la app' }],
      ]),
    })
    expect(r.failures).toBeNull()
  })

  it('si quedan menos de los admitidos, falla: obliga a bajar el número', async () => {
    const { root, write } = await repo()
    write('src/Arreglado.tsx', conAccion)
    const r = checkEmptyStates({
      root,
      admitidos: new Map([['src/Arreglado.tsx', { n: 1, motivo: 'ya no hace falta' }]]),
    })
    expect(r.rancios).toEqual([{ archivo: 'src/Arreglado.tsx', admitidos: 1, real: 0 }])
    expect(r.failures).not.toBeNull()
  })

  it('los componentes que dicen traer su salida dentro contienen de verdad un botón', () => {
    for (const [nombre, archivo] of COMPONENTES_CON_SALIDA) {
      expect(readFileSync(archivo, 'utf8'), nombre).toMatch(/<button\b/)
    }
  })

  it('el repo real pasa el trinquete', () => {
    expect(checkEmptyStates().failures).toBeNull()
  })
})
