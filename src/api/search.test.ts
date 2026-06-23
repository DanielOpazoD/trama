import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.hoisted(() => vi.fn())

vi.mock('./request', () => ({
  request: requestMock,
}))

import { searchApi } from './search'

beforeEach(() => {
  requestMock.mockReset()
})

describe('searchApi client contract', () => {
  it('codifica query, limit y mode en el endpoint privado de búsqueda', async () => {
    requestMock.mockResolvedValueOnce({
      entities: [],
      quotes: [],
      momentos: [],
      cronicas: [],
      chat: [],
      mode: 'semantic',
    })

    await expect(
      searchApi.search('Borges & Bioy', { limit: 12, mode: 'semantic' }),
    ).resolves.toMatchObject({ mode: 'semantic' })

    expect(requestMock).toHaveBeenCalledWith(
      '/api/search?q=Borges+%26+Bioy&limit=12&mode=semantic',
    )
  })

  it('usa hybrid por contrato del servidor cuando no se envía mode', async () => {
    requestMock.mockResolvedValueOnce({
      entities: [{ id: 'e1', name: 'Borges', type: 'persona', score: 0.9 }],
      quotes: [],
      momentos: [],
      cronicas: [],
      chat: [],
      mode: 'hybrid',
    })

    await searchApi.search('borges')

    expect(requestMock).toHaveBeenCalledWith('/api/search?q=borges')
  })
})
