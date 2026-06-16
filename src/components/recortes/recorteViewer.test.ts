import { describe, expect, it } from 'vitest'
import type { Recorte } from '../../api'
import { recorteToLightboxEntries } from './recorteViewer'

function recorte(over: Partial<Recorte> = {}): Recorte {
  return {
    id: 'r',
    text: 'una captura',
    sourceUrl: null,
    sourceTitle: null,
    sourceAuthor: null,
    note: null,
    imageUrl: null,
    imageKey: null,
    images: [],
    captureMode: 'image',
    status: 'pending',
    promotedTarget: null,
    promotedId: null,
    captureSource: null,
    capturedAt: null,
    createdAt: '2026-06-14T12:00:00.000Z',
    updatedAt: '2026-06-14T12:00:00.000Z',
    ...over,
  }
}

describe('recorteToLightboxEntries', () => {
  it('un recorte-evento aporta una entrada por imagen, en orden', () => {
    const entries = recorteToLightboxEntries(
      recorte({
        imageKey: 'k0',
        images: [{ storageKey: 'k0' }, { storageKey: 'k1' }],
        sourceTitle: 'Evento',
      }),
    )
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.url)).toEqual([
      '/api/recortes-image/k0',
      '/api/recortes-image/k1',
    ])
    expect(entries.every((e) => e.caption === 'Evento')).toBe(true)
  })

  it('imagen externa (OG) sin images[] → una sola entrada con esa URL', () => {
    const entries = recorteToLightboxEntries(
      recorte({ imageUrl: 'https://x/og.jpg', sourceTitle: null, text: 'cuerpo' }),
    )
    expect(entries).toEqual([{ url: 'https://x/og.jpg', caption: 'cuerpo' }])
  })

  it('sin imagen propia → vacío', () => {
    expect(recorteToLightboxEntries(recorte())).toEqual([])
  })
})
