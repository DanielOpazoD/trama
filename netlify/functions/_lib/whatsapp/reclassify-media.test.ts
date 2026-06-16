import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockSqlResponses, setupMockSql } from '../test-utils'

vi.mock('../db.js', () => setupMockSql())
vi.mock('../embeddings.js', () => ({
  embedSafe: vi.fn(async () => ({ vector: [0.1, 0.2], model: 'test-embed' })),
  entityEmbeddingText: vi.fn((i) => `entity:${i.name}`),
  quoteEmbeddingText: vi.fn((i) => `quote:${i.text}`),
  toPgVector: vi.fn((v) => `[${v.join(',')}]`),
}))

// Copia de blobs entre stores (recortes-media → momentos-media / notas-attachments).
const { blobStore } = vi.hoisted(() => ({
  blobStore: { getWithMetadata: vi.fn(), set: vi.fn() },
}))
vi.mock('@netlify/blobs', () => ({ getStore: vi.fn(() => blobStore) }))

import { getSql } from '../db.js'
import {
  readRecorteImageKeys,
  reclassifyRecorteToMomento,
  reclassifyRecorteToNote,
} from './reclassify-media'

beforeEach(() => {
  mockSqlResponses.reset()
  blobStore.getWithMetadata.mockReset()
  blobStore.set.mockReset()
  blobStore.getWithMetadata.mockResolvedValue({
    data: new ArrayBuffer(8),
    metadata: { mime: 'image/webp', size: '8' },
  })
})

describe('readRecorteImageKeys', () => {
  it('devuelve las storage_key del evento por posición (recorte_images)', async () => {
    mockSqlResponses.push([{ storage_key: 'u/a.webp' }, { storage_key: 'u/b.webp' }]) // SELECT recorte_images
    const keys = await readRecorteImageKeys(getSql(), 'u1', 'r1')
    expect(keys).toEqual(['u/a.webp', 'u/b.webp'])
  })

  it('cae a [image_key] cuando no hay recorte_images (recorte legacy)', async () => {
    mockSqlResponses.push([]) // SELECT recorte_images (vacío)
    mockSqlResponses.push([{ image_key: 'u/sola.webp' }]) // SELECT image_key
    const keys = await readRecorteImageKeys(getSql(), 'u1', 'r1')
    expect(keys).toEqual(['u/sola.webp'])
  })

  it('vacío cuando el recorte no tiene imagen propia (texto/enlace)', async () => {
    mockSqlResponses.push([]) // SELECT recorte_images
    mockSqlResponses.push([{ image_key: null }]) // SELECT image_key
    const keys = await readRecorteImageKeys(getSql(), 'u1', 'r1')
    expect(keys).toEqual([])
  })
})

describe('reclassifyRecorteToMomento', () => {
  it('copia TODAS las imágenes a momentos-media y crea un foto episodio', async () => {
    mockSqlResponses.push([
      { storage_key: 'u/a.webp' },
      { storage_key: 'u/b.webp' },
      { storage_key: 'u/c.webp' },
    ]) // recorte_images
    mockSqlResponses.push([{ id: 'm1' }]) // INSERT momentos RETURNING id

    const id = await reclassifyRecorteToMomento(getSql(), 'u1', 'r1', 'mi gato')
    expect(id).toBe('m1')
    expect(blobStore.getWithMetadata).toHaveBeenCalledTimes(3)
    expect(blobStore.set).toHaveBeenCalledTimes(3)
    // El INSERT usa kind 'foto' y payload con items[] (no storageKey suelto).
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO momentos/i.test(c.template),
    )
    expect(insert?.template).toMatch(/'foto'/)
    const payload = insert?.values.find(
      (v): v is string => typeof v === 'string' && v.includes('"items"'),
    )
    expect(payload).toContain('"caption":"mi gato"')
    expect((payload?.match(/"storageKey"/g) ?? []).length).toBe(3)
  })

  it('devuelve null cuando el recorte no tiene imágenes (→ camino de texto)', async () => {
    mockSqlResponses.push([]) // recorte_images vacío
    mockSqlResponses.push([{ image_key: null }]) // image_key null
    const id = await reclassifyRecorteToMomento(getSql(), 'u1', 'r1', '')
    expect(id).toBeNull()
    expect(blobStore.set).not.toHaveBeenCalled()
  })
})

describe('reclassifyRecorteToNote', () => {
  it('crea la nota y adjunta una fila por imagen en notas_attachments', async () => {
    mockSqlResponses.push([{ storage_key: 'u/a.webp' }, { storage_key: 'u/b.webp' }]) // recorte_images
    mockSqlResponses.push([{ id: 'n1' }]) // INSERT notes RETURNING id
    mockSqlResponses.push([]) // INSERT notas_attachments #0
    mockSqlResponses.push([]) // INSERT notas_attachments #1

    const id = await reclassifyRecorteToNote(getSql(), 'u1', 'r1', 'apuntes')
    expect(id).toBe('n1')
    expect(blobStore.set).toHaveBeenCalledTimes(2)
    // Dos INSERT a notas_attachments con owner_type 'note' y el id de la nota.
    const attachInserts = mockSqlResponses.calls.filter((c) =>
      /INSERT INTO notas_attachments/i.test(c.template),
    )
    expect(attachInserts).toHaveLength(2)
    // owner_type 'note' es literal en el SQL; el owner_id (n1) es parámetro.
    expect(attachInserts[0]?.template).toMatch(/'note'/)
    expect(attachInserts[0]?.values).toContain('n1')
    // El contenido de la nota es el texto del recorte.
    const noteInsert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO notes/i.test(c.template),
    )
    expect(noteInsert?.values).toContain('apuntes')
  })

  it('devuelve null cuando el recorte no tiene imágenes', async () => {
    mockSqlResponses.push([]) // recorte_images vacío
    mockSqlResponses.push([{ image_key: null }]) // image_key null
    const id = await reclassifyRecorteToNote(getSql(), 'u1', 'r1', 'x')
    expect(id).toBeNull()
    expect(blobStore.set).not.toHaveBeenCalled()
  })
})
