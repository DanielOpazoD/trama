import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockContext } from './test-utils'

import handler from '../wikipedia-search'

/**
 * /api/wikipedia/search — proxy a la MediaWiki API. Cubre validación, el mapeo
 * de la respuesta, el saneo anti-SSRF del `lang`, y el error upstream.
 */
describe('wikipedia-search endpoint', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('405 en método no-GET', async () => {
    const res = await handler(
      new Request('http://localhost/api/wikipedia/search?q=x', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  it('400 sin q', async () => {
    const res = await handler(
      new Request('http://localhost/api/wikipedia/search'),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('mapea resultados de MediaWiki a {title, url, description}', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        pages: [
          {
            key: 'Jorge_Luis_Borges',
            title: 'Jorge Luis Borges',
            description: 'escritor argentino',
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await handler(
      new Request('http://localhost/api/wikipedia/search?q=Borges'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toEqual([
      {
        title: 'Jorge Luis Borges',
        url: 'https://es.wikipedia.org/wiki/Jorge_Luis_Borges',
        description: 'escritor argentino',
      },
    ])
    expect(String(fetchMock.mock.calls[0]![0])).toContain('es.wikipedia.org')
  })

  it('sanea un lang inválido a "es" (anti-SSRF)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ pages: [] }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    await handler(
      new Request('http://localhost/api/wikipedia/search?q=x&lang=evil.com/@h'),
      mockContext(),
    )
    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).toContain('https://es.wikipedia.org/')
    expect(url).not.toContain('evil')
  })

  it('502 si Wikipedia responde con error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    )
    const res = await handler(
      new Request('http://localhost/api/wikipedia/search?q=x'),
      mockContext(),
    )
    expect(res.status).toBe(502)
  })
})
