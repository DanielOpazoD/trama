import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearEmbeddingCache, embed } from './embeddings'

function stubOpenAIKey() {
  vi.stubGlobal('Netlify', {
    env: {
      get: vi.fn((key: string) => (key === 'OPENAI_API_KEY' ? 'sk-test' : undefined)),
    },
  })
}

function mockEmbedResponse(vector: number[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({ data: [{ embedding: vector }], model: 'text-embedding-3-small' }),
    json: async () => ({
      data: [{ embedding: vector }],
      model: 'text-embedding-3-small',
    }),
  })
}

beforeEach(() => {
  stubOpenAIKey()
  clearEmbeddingCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('embed — cache de queries', () => {
  it('hace la llamada una sola vez para queries idénticas', async () => {
    const vector = Array.from({ length: 1536 }, () => 0.1)
    const fetchMock = mockEmbedResponse(vector)
    vi.stubGlobal('fetch', fetchMock)

    await embed('Borges')
    await embed('Borges')
    await embed('Borges')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('considera "Borges" y "borges " la misma query (normaliza)', async () => {
    const vector = Array.from({ length: 1536 }, () => 0.1)
    const fetchMock = mockEmbedResponse(vector)
    vi.stubGlobal('fetch', fetchMock)

    await embed('Borges')
    await embed('  borges')
    await embed('BORGES  ')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fuerza refresh cuando se pasa noCache', async () => {
    const vector = Array.from({ length: 1536 }, () => 0.1)
    const fetchMock = mockEmbedResponse(vector)
    vi.stubGlobal('fetch', fetchMock)

    await embed('Borges')
    await embed('Borges', { noCache: true })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('queries distintas se cachean por separado', async () => {
    const vector = Array.from({ length: 1536 }, () => 0.1)
    const fetchMock = mockEmbedResponse(vector)
    vi.stubGlobal('fetch', fetchMock)

    await embed('Borges')
    await embed('Cortázar')
    await embed('Borges')
    await embed('Cortázar')

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
