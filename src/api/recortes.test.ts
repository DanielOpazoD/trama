import { describe, expect, it } from 'vitest'
import { recorteFromRow, recorteImageUrl, type RecorteRow } from './recortes'

function row(over: Partial<RecorteRow> = {}): RecorteRow {
  return {
    id: 'r1',
    text: 'captura',
    source_url: null,
    source_title: null,
    source_author: null,
    note: null,
    image_url: null,
    image_key: null,
    capture_mode: 'image',
    status: 'pending',
    promoted_target: null,
    promoted_id: null,
    captured_at: null,
    created_at: '2026-06-14T12:00:00.000Z',
    updated_at: '2026-06-14T12:00:00.000Z',
    ...over,
  }
}

describe('recorteFromRow — normalización de images[]', () => {
  it('usa recorte_images (evento multi-imagen) cuando hay filas', () => {
    const r = recorteFromRow(
      row({
        image_key: 'cover.jpg',
        images: [{ storage_key: 'cover.jpg' }, { storage_key: 'b.jpg' }],
      }),
    )
    expect(r.images).toEqual([{ storageKey: 'cover.jpg' }, { storageKey: 'b.jpg' }])
    // image_key sigue siendo la portada.
    expect(r.imageKey).toBe('cover.jpg')
  })

  it('cae a [image_key] cuando no hay recorte_images (recorte legacy de una imagen)', () => {
    const r = recorteFromRow(row({ image_key: 'sola.jpg', images: [] }))
    expect(r.images).toEqual([{ storageKey: 'sola.jpg' }])
  })

  it('cae a [image_key] cuando images viene ausente (null/undefined)', () => {
    const r = recorteFromRow(row({ image_key: 'sola.jpg', images: null }))
    expect(r.images).toEqual([{ storageKey: 'sola.jpg' }])
  })

  it('queda vacío cuando el recorte no tiene imagen propia (solo texto/enlace)', () => {
    const r = recorteFromRow(row({ image_key: null, images: [] }))
    expect(r.images).toEqual([])
  })
})

describe('recorteImageUrl', () => {
  it('codifica cada segmento por separado preservando el path de dos partes', () => {
    expect(recorteImageUrl('user 1/blob a.jpg')).toBe(
      '/api/recortes-image/user%201/blob%20a.jpg',
    )
  })
})
