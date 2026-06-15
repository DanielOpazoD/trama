import { describe, expect, it, vi } from 'vitest'
import type { SqlClient } from './db'

const { blobStore } = vi.hoisted(() => ({ blobStore: { set: vi.fn() } }))
vi.mock('@netlify/blobs', () => ({ getStore: vi.fn(() => blobStore) }))

import {
  persistImageRecorte,
  persistImageMomento,
  persistImageMomentoEpisode,
  persistVoiceNoteAttachment,
} from './whatsapp/persist-media'

/**
 * fakeSql que devuelve `rows` y captura los valores interpolados del template
 * para poder afirmar la procedencia (source / origin.importedFrom) que graba
 * cada INSERT — el iconito de "vino desde WhatsApp" depende de eso.
 */
function fakeSql(rows: unknown[]): { sql: SqlClient; calls: unknown[][] } {
  const calls: unknown[][] = []
  const sql = ((_strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(values)
    return Promise.resolve(rows)
  }) as unknown as SqlClient
  return { sql, calls }
}

describe('persistImageRecorte', () => {
  it('inserta recorte con la imagen, marca source=whatsapp y devuelve id', async () => {
    const { sql, calls } = fakeSql([{ id: 'r1' }])
    const r = await persistImageRecorte(sql, 'u1', 'u1/abc.jpg', 'mi foto')
    expect(r.message).toContain('Recortes')
    expect(r.id).toBe('r1')
    // Procedencia: 'whatsapp' va como literal en la columna source, y los
    // valores interpolados incluyen el caption, la imageKey y el userId.
    expect(calls[0]).toContain('mi foto')
    expect(calls[0]).toContain('u1/abc.jpg')
    expect(calls[0]).toContain('u1')
  })

  it('sin caption usa texto mínimo (recortes.text es NOT NULL)', async () => {
    const { sql, calls } = fakeSql([{ id: 'r2' }])
    const r = await persistImageRecorte(sql, 'u1', 'u1/x.jpg', '')
    expect(r.id).toBe('r2')
    expect(calls[0]).toContain('📷 Imagen desde WhatsApp')
  })

  it('si el INSERT no devuelve id, lanza (no reporta éxito con blob huérfano)', async () => {
    const { sql } = fakeSql([])
    await expect(persistImageRecorte(sql, 'u1', 'u1/x.jpg', 'x')).rejects.toThrow(/id/)
  })
})

describe('persistImageMomento', () => {
  it('inserta momento foto con origin.importedFrom=whatsapp y devuelve id', async () => {
    const { sql, calls } = fakeSql([{ id: 'm1' }])
    const r = await persistImageMomento(sql, 'u1', 'u1/x.jpg', 'cumple')
    expect(r.message).toContain('Momentos')
    expect(r.id).toBe('m1')
    // El origin jsonb debe declarar la procedencia WhatsApp.
    const origin = calls[0].find(
      (v): v is string => typeof v === 'string' && v.includes('importedFrom'),
    )
    expect(origin).toBeDefined()
    expect(JSON.parse(origin!)).toMatchObject({ importedFrom: 'whatsapp' })
    // El payload lleva la storageKey y el caption.
    const payload = calls[0].find(
      (v): v is string => typeof v === 'string' && v.includes('storageKey'),
    )
    expect(JSON.parse(payload!)).toMatchObject({
      storageKey: 'u1/x.jpg',
      caption: 'cumple',
    })
  })

  it('si el INSERT no devuelve id, lanza', async () => {
    const { sql } = fakeSql([])
    await expect(persistImageMomento(sql, 'u1', 'u1/x.jpg', '')).rejects.toThrow(/id/)
  })
})

describe('persistImageMomentoEpisode', () => {
  it('agrupa varias fotos en un solo momento con payload.items[]', async () => {
    const { sql, calls } = fakeSql([{ id: 'm9' }])
    const r = await persistImageMomentoEpisode(
      sql,
      'u1',
      ['u1/a.jpg', 'u1/b.jpg'],
      'viaje',
    )
    expect(r.id).toBe('m9')
    expect(r.message).toContain('2 fotos')
    const payload = calls[0].find(
      (v): v is string => typeof v === 'string' && v.includes('items'),
    )
    expect(JSON.parse(payload!)).toMatchObject({
      items: [{ storageKey: 'u1/a.jpg' }, { storageKey: 'u1/b.jpg' }],
      caption: 'viaje',
    })
    const origin = calls[0].find(
      (v): v is string => typeof v === 'string' && v.includes('importedFrom'),
    )
    expect(JSON.parse(origin!)).toMatchObject({ importedFrom: 'whatsapp' })
  })

  it('una sola foto: items de largo 1 y mensaje singular', async () => {
    const { sql, calls } = fakeSql([{ id: 'm1' }])
    const r = await persistImageMomentoEpisode(sql, 'u1', ['u1/solo.jpg'], '')
    expect(r.message).toBe('📷 Foto añadida a Momentos.')
    const payload = calls[0].find(
      (v): v is string => typeof v === 'string' && v.includes('items'),
    )
    expect(JSON.parse(payload!)).toEqual({ items: [{ storageKey: 'u1/solo.jpg' }] })
  })

  it('si el INSERT no devuelve id, lanza', async () => {
    const { sql } = fakeSql([])
    await expect(persistImageMomentoEpisode(sql, 'u1', ['u1/x.jpg'], '')).rejects.toThrow(
      /id/,
    )
  })
})

describe('persistVoiceNoteAttachment', () => {
  it('sube el audio y lo inserta como anexo de audio de la nota', async () => {
    blobStore.set.mockClear()
    const { sql, calls } = fakeSql([])
    await persistVoiceNoteAttachment(
      sql,
      'u1',
      'note-9',
      new ArrayBuffer(120),
      'audio/ogg',
    )
    expect(blobStore.set).toHaveBeenCalledTimes(1)
    // Valores interpolados: id de la nota, mime de audio, tamaño y userId.
    expect(calls[0]).toContain('note-9')
    expect(calls[0]).toContain('audio/ogg')
    expect(calls[0]).toContain(120)
    expect(calls[0]).toContain('u1')
  })
})
