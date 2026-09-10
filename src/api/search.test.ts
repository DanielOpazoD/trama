import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestContractMock = vi.hoisted(() => vi.fn())

// La búsqueda pasa por el contrato de lectura `search` (verifica los cinco grupos).
vi.mock('./request', () => ({
  requestContract: requestContractMock,
}))

import { searchApi } from './search'

beforeEach(() => {
  requestContractMock.mockReset()
})

describe('searchApi client contract', () => {
  it('codifica query, limit y mode en el endpoint privado de búsqueda', async () => {
    requestContractMock.mockResolvedValueOnce({
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

    expect(requestContractMock).toHaveBeenCalledWith(
      'search',
      '/api/search?q=Borges+%26+Bioy&limit=12&mode=semantic',
    )
  })

  it('usa hybrid por contrato del servidor cuando no se envía mode', async () => {
    requestContractMock.mockResolvedValueOnce({
      entities: [{ id: 'e1', name: 'Borges', type: 'persona', score: 0.9 }],
      quotes: [],
      momentos: [],
      cronicas: [],
      chat: [],
      mode: 'hybrid',
    })

    await searchApi.search('borges')

    expect(requestContractMock).toHaveBeenCalledWith('search', '/api/search?q=borges')
  })
})
