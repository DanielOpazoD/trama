import { describe, expect, it } from 'vitest'
import type { SqlClient } from './db'
import { persistImageRecorte, persistImageMomento } from './whatsapp/persist-media'

function fakeSql(rows: unknown[]): SqlClient {
  return ((..._args: unknown[]) => Promise.resolve(rows)) as unknown as SqlClient
}

describe('persistImageRecorte', () => {
  it('inserta recorte con la imagen y devuelve id', async () => {
    const r = await persistImageRecorte(
      fakeSql([{ id: 'r1' }]),
      'u1',
      'u1/abc.jpg',
      'mi foto',
    )
    expect(r.message).toContain('Recortes')
    expect(r.id).toBe('r1')
  })
  it('sin caption usa texto mínimo (recortes.text es NOT NULL)', async () => {
    const r = await persistImageRecorte(fakeSql([{ id: 'r2' }]), 'u1', 'u1/x.jpg', '')
    expect(r.id).toBe('r2')
  })
})

describe('persistImageMomento', () => {
  it('inserta momento foto y devuelve id', async () => {
    const r = await persistImageMomento(
      fakeSql([{ id: 'm1' }]),
      'u1',
      'u1/x.jpg',
      'cumple',
    )
    expect(r.message).toContain('Momentos')
    expect(r.id).toBe('m1')
  })
})
