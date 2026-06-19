import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const requestMocks = vi.hoisted(() => ({
  requestBlob: vi.fn(async () => new Blob(['media'], { type: 'image/jpeg' })),
}))

vi.mock('../../api/request', async (importActual) => ({
  ...(await importActual<typeof import('../../api/request')>()),
  requestBlob: requestMocks.requestBlob,
}))

import { ApiClientError } from '../../api/request'
import { useAuthenticatedMediaState } from './AuthenticatedMedia'

describe('useAuthenticatedMediaState', () => {
  beforeEach(() => {
    requestMocks.requestBlob.mockClear()
    requestMocks.requestBlob.mockResolvedValue(
      new Blob(['media'], { type: 'image/jpeg' }),
    )
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:media'),
        revokeObjectURL: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resuelve media privada mediante requestBlob', async () => {
    const { result } = renderHook(() =>
      useAuthenticatedMediaState('/api/notas-attachments-file/u/foto.jpg'),
    )

    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(requestMocks.requestBlob).toHaveBeenCalledWith(
      '/api/notas-attachments-file/u/foto.jpg',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(result.current.src).toBe('blob:media')
  })

  it('mantiene el fallback legacy sin auth solo para media antigua de Momentos', async () => {
    requestMocks.requestBlob.mockRejectedValueOnce(
      new ApiClientError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'No encontrada',
        requestId: 'rid-media',
      }),
    )
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(new Blob(['legacy'], { type: 'image/jpeg' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useAuthenticatedMediaState('/api/momentos-file/legacy-single-user/foto.jpg'),
    )

    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/momentos-file/legacy-single-user/foto.jpg',
      expect.objectContaining({ headers: {} }),
    )
    expect(result.current.src).toBe('blob:media')
  })
})
