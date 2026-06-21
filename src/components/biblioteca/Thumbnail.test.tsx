import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'

// Los endpoints de blob son autenticados: Thumbnail los baja con requestBlob
// (vía useAuthenticatedMediaState) y los muestra como object-URL. Mockeamos
// requestBlob + URL.createObjectURL igual que AuthenticatedMedia.test.
const requestMocks = vi.hoisted(() => ({
  requestBlob: vi.fn(async () => new Blob(['media'], { type: 'image/svg+xml' })),
}))

vi.mock('../../api/request', async (importActual) => ({
  ...(await importActual<typeof import('../../api/request')>()),
  requestBlob: requestMocks.requestBlob,
}))

import { Thumbnail } from './Thumbnail'
import type { LibraryItem } from '../../types/biblioteca'

function item(partial: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'recorte-image:1',
    kind: 'recorte-image',
    itemId: '1',
    title: 'archivo',
    fileType: 'image',
    source: 'capturado',
    mimeType: 'image/png',
    byteSize: 1024,
    storageKey: 'demo/foto-1.svg',
    storageDomain: 'recortes-media',
    tags: [],
    pinned: false,
    aiStatus: null,
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
    ...partial,
  }
}

describe('<Thumbnail />', () => {
  beforeEach(() => {
    requestMocks.requestBlob.mockClear()
    requestMocks.requestBlob.mockResolvedValue(
      new Blob(['media'], { type: 'image/svg+xml' }),
    )
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:thumb'),
        revokeObjectURL: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('baja la imagen autenticada y la muestra como object-URL', async () => {
    const { container } = render(<Thumbnail item={item()} />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('loading', 'lazy')
    // La URL servida se arma del dominio + key codificada y pasa por requestBlob.
    await waitFor(() =>
      expect(requestMocks.requestBlob).toHaveBeenCalledWith(
        '/api/recortes-image/demo/foto-1.svg',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    )
    await waitFor(() => expect(img?.getAttribute('src')).toBe('blob:thumb'))
  })

  it('cae al ícono de tipo (sin <img>) para un item que no es imagen', () => {
    const { container } = render(
      <Thumbnail
        item={item({
          fileType: 'pdf',
          mimeType: 'application/pdf',
          storageDomain: 'notas-attachments',
        })}
      />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
    expect(requestMocks.requestBlob).not.toHaveBeenCalled()
  })

  it('cae al ícono cuando una imagen no tiene URL de servir (dominio PDF)', () => {
    const { container } = render(
      <Thumbnail
        item={item({
          fileType: 'image',
          storageDomain: 'pdf-stamp-assets',
          storageKey: 'demo/firma',
        })}
      />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('cae al ícono si la descarga del blob falla', async () => {
    requestMocks.requestBlob.mockRejectedValueOnce(new Error('boom'))
    const { container } = render(<Thumbnail item={item()} />)
    await waitFor(() => {
      expect(container.querySelector('img')).toBeNull()
      expect(container.querySelector('svg')).not.toBeNull()
    })
  })
})
