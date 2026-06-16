import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mockSqlResponses, setupMockSql } from '../test-utils'

vi.mock('../db.js', () => setupMockSql())
vi.mock('../embeddings.js', () => ({
  embedSafe: vi.fn(async () => ({ vector: [0.1, 0.2], model: 'test-embed' })),
  entityEmbeddingText: vi.fn((i) => `entity:${i.name}`),
  quoteEmbeddingText: vi.fn((i) => `quote:${i.text}`),
  toPgVector: vi.fn((v) => `[${v.join(',')}]`),
}))

// Copia de blobs entre stores (recortes-media → momentos-media / notas-attachments)
// + delete para limpiar copias huérfanas cuando una tanda falla a medias.
const { blobStore } = vi.hoisted(() => ({
  blobStore: { getWithMetadata: vi.fn(), set: vi.fn(), delete: vi.fn() },
}))
vi.mock('@netlify/blobs', () => ({ getStore: vi.fn(() => blobStore) }))

import { getSql } from '../db.js'
import {
  readRecorteImageKeys,
  reclassifyRecorteToMomento,
  reclassifyRecorteToNote,
} from './reclassify-media'

const blob = { data: new ArrayBuffer(8), metadata: { mime: 'image/webp', size: '8' } }

beforeEach(() => {
  mockSqlResponses.reset()
  blobStore.getWithMetadata.mockReset()
  blobStore.set.mockReset()
  blobStore.delete.mockReset()
  blobStore.getWithMetadata.mockResolvedValue(blob)
})

describe('readRecorteImageKeys', () => {
  it('devuelve las storage_key del evento por posición (recorte_images)', async () => {
    mockSqlResponses.push([{ storage_key: 'u/a.webp' }, { storage_key: 'u/b.webp' }])
    const keys = await readRecorteImageKeys(getSql(), 'u1', 'r1')
    expect(keys).toEqual(['u/a.webp', 'u/b.webp'])
  })

  it('cae a [image_key] cuando no hay recorte_images (recorte legacy)', async () => {
    mockSqlResponses.push([]) // recorte_images vacío
    mockSqlResponses.push([{ image_key: 'u/sola.webp' }]) // image_key
    const keys = await readRecorteImageKeys(getSql(), 'u1', 'r1')
    expect(keys).toEqual(['u/sola.webp'])
  })

  it('vacío cuando el recorte no tiene imagen propia (texto/enlace)', async () => {
    mockSqlResponses.push([]) // recorte_images
    mockSqlResponses.push([{ image_key: null }]) // image_key
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

    const result = await reclassifyRecorteToMomento(getSql(), 'u1', 'r1', 'mi gato')
    expect(result).toEqual({ status: 'ok', id: 'm1' })
    expect(blobStore.getWithMetadata).toHaveBeenCalledTimes(3)
    expect(blobStore.set).toHaveBeenCalledTimes(3)
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

  it('status no-images cuando el recorte no tiene imágenes (→ camino de texto)', async () => {
    mockSqlResponses.push([]) // recorte_images vacío
    mockSqlResponses.push([{ image_key: null }]) // image_key null
    const result = await reclassifyRecorteToMomento(getSql(), 'u1', 'r1', '')
    expect(result).toEqual({ status: 'no-images' })
    expect(blobStore.set).not.toHaveBeenCalled()
  })

  it('copia parcial → status failed, NO crea el momento y limpia los huérfanos', async () => {
    mockSqlResponses.push([{ storage_key: 'u/a.webp' }, { storage_key: 'u/b.webp' }]) // recorte_images
    // La 1.ª copia tiene blob; la 2.ª no existe (getWithMetadata → null).
    blobStore.getWithMetadata.mockReset()
    blobStore.getWithMetadata.mockResolvedValueOnce(blob).mockResolvedValueOnce(null)

    const result = await reclassifyRecorteToMomento(getSql(), 'u1', 'r1', 'x')
    expect(result).toEqual({ status: 'failed' })
    // No se insertó ningún momento (no se pierde a medias).
    expect(
      mockSqlResponses.calls.some((c) => /INSERT INTO momentos/i.test(c.template)),
    ).toBe(false)
    // La 1.ª copia (huérfana) se limpió del store destino.
    expect(blobStore.delete).toHaveBeenCalledTimes(1)
  })

  it('caption sintético "📸 N imágenes desde WhatsApp" no viaja como caption', async () => {
    mockSqlResponses.push([{ storage_key: 'u/a.webp' }]) // recorte_images
    mockSqlResponses.push([{ id: 'm1' }]) // INSERT momentos
    await reclassifyRecorteToMomento(getSql(), 'u1', 'r1', '📸 3 imágenes desde WhatsApp')
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO momentos/i.test(c.template),
    )
    const payload = insert?.values.find(
      (v): v is string => typeof v === 'string' && v.includes('"items"'),
    )
    expect(payload).not.toContain('caption')
  })
})

describe('reclassifyRecorteToNote', () => {
  it('crea la nota y adjunta una fila por imagen en notas_attachments', async () => {
    mockSqlResponses.push([{ storage_key: 'u/a.webp' }, { storage_key: 'u/b.webp' }]) // recorte_images
    mockSqlResponses.push([{ id: 'n1' }]) // INSERT notes RETURNING id
    mockSqlResponses.push([]) // INSERT notas_attachments #0
    mockSqlResponses.push([]) // INSERT notas_attachments #1

    const result = await reclassifyRecorteToNote(getSql(), 'u1', 'r1', 'apuntes')
    expect(result).toEqual({ status: 'ok', id: 'n1' })
    expect(blobStore.set).toHaveBeenCalledTimes(2)
    const attachInserts = mockSqlResponses.calls.filter((c) =>
      /INSERT INTO notas_attachments/i.test(c.template),
    )
    expect(attachInserts).toHaveLength(2)
    // owner_type 'note' es literal en el SQL; el owner_id (n1) es parámetro.
    expect(attachInserts[0]?.template).toMatch(/'note'/)
    expect(attachInserts[0]?.values).toContain('n1')
    const noteInsert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO notes/i.test(c.template),
    )
    expect(noteInsert?.values).toContain('apuntes')
  })

  it('status no-images cuando el recorte no tiene imágenes', async () => {
    mockSqlResponses.push([]) // recorte_images vacío
    mockSqlResponses.push([{ image_key: null }]) // image_key null
    const result = await reclassifyRecorteToNote(getSql(), 'u1', 'r1', 'x')
    expect(result).toEqual({ status: 'no-images' })
    expect(blobStore.set).not.toHaveBeenCalled()
  })

  it('copia fallida → status failed y NO crea la nota (no la deja sin fotos)', async () => {
    mockSqlResponses.push([{ storage_key: 'u/a.webp' }]) // recorte_images
    blobStore.getWithMetadata.mockReset()
    blobStore.getWithMetadata.mockResolvedValue(null) // el blob ya no existe

    const result = await reclassifyRecorteToNote(getSql(), 'u1', 'r1', 'x')
    expect(result).toEqual({ status: 'failed' })
    // No se creó ninguna nota: el recorte original (lo decide el caller) queda vivo.
    expect(
      mockSqlResponses.calls.some((c) => /INSERT INTO notes/i.test(c.template)),
    ).toBe(false)
  })

  it('caption sintético no termina como cuerpo de la nota', async () => {
    mockSqlResponses.push([{ storage_key: 'u/a.webp' }]) // recorte_images
    mockSqlResponses.push([{ id: 'n1' }]) // INSERT notes
    mockSqlResponses.push([]) // INSERT notas_attachments
    await reclassifyRecorteToNote(getSql(), 'u1', 'r1', '📷 Imagen desde WhatsApp')
    const noteInsert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO notes/i.test(c.template),
    )
    // El cuerpo cae al placeholder neutro, no al rótulo con conteo.
    expect(noteInsert?.values).toContain('Imágenes desde WhatsApp')
    expect(noteInsert?.values).not.toContain('📷 Imagen desde WhatsApp')
  })
})
