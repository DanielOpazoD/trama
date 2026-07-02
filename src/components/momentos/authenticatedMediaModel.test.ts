import { describe, expect, it } from 'vitest'
import { ApiClientError } from '../../api/request'
import {
  shouldFetchWithApiClient,
  shouldRetryLegacyMediaWithoutAuth,
} from './authenticatedMediaModel'

const notFound = new ApiClientError({
  code: 'NOT_FOUND',
  status: 404,
  message: 'No encontrada',
  requestId: 'rid-media',
})

const unauthorized = new ApiClientError({
  code: 'UNAUTHORIZED',
  status: 401,
  message: 'No autorizada',
  requestId: 'rid-media',
})

describe('authenticatedMediaModel', () => {
  it('detecta endpoints privados que deben usar requestBlob', () => {
    expect(shouldFetchWithApiClient('/api/momentos-file/user_123/foto.jpg')).toBe(true)
    expect(shouldFetchWithApiClient('/api/notas-attachments-file/u/foto.jpg')).toBe(true)
    expect(shouldFetchWithApiClient('/api/recortes-image/u/foto.jpg')).toBe(true)
    expect(shouldFetchWithApiClient('/api/library-uploads-file/u/doc.pdf')).toBe(true)
    expect(shouldFetchWithApiClient('https://cdn.example.com/foto.jpg')).toBe(false)
  })

  it('permite fallback sin auth solo para media legacy de Momentos ante 401/404', () => {
    expect(
      shouldRetryLegacyMediaWithoutAuth(
        '/api/momentos-file/legacy-single-user/foto.jpg',
        notFound,
      ),
    ).toBe(true)
    expect(
      shouldRetryLegacyMediaWithoutAuth(
        '/api/momentos-file/legacy-single-user%2Ffoto.jpg',
        unauthorized,
      ),
    ).toBe(true)
    expect(
      shouldRetryLegacyMediaWithoutAuth('/api/momentos-file/foto-vieja.jpg', notFound),
    ).toBe(true)
  })

  it('rechaza fallback sin auth para media scoped, otros endpoints y otros errores', () => {
    expect(
      shouldRetryLegacyMediaWithoutAuth('/api/momentos-file/user_123/foto.jpg', notFound),
    ).toBe(false)
    expect(
      shouldRetryLegacyMediaWithoutAuth(
        '/api/notas-attachments-file/legacy-single-user/foto.jpg',
        notFound,
      ),
    ).toBe(false)
    expect(
      shouldRetryLegacyMediaWithoutAuth(
        '/api/momentos-file/legacy-single-user/foto.jpg',
        new Error('network'),
      ),
    ).toBe(false)
    expect(
      shouldRetryLegacyMediaWithoutAuth(
        '/api/momentos-file/legacy-single-user/foto.jpg',
        new ApiClientError({
          code: 'FORBIDDEN',
          status: 403,
          message: 'No',
          requestId: 'rid-media',
        }),
      ),
    ).toBe(false)
  })
})
