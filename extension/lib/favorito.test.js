import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveFavorito } from './favorito.js'

/** Guardado de favoritos: POST a /api/favoritos con token. chrome.storage y
 *  fetch mockeados. */

function installChrome(token = 'trama_pat_x') {
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async () => ({ tramaToken: token, tramaBaseUrl: 'https://api.test' })),
      },
    },
  }
}

beforeEach(() => installChrome())
afterEach(() => vi.unstubAllGlobals())

describe('saveFavorito', () => {
  it('postea url + título y devuelve ok (200)', async () => {
    let body = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        body = JSON.parse(init.body)
        return new Response('{}', { status: 200 })
      }),
    )
    const r = await saveFavorito({ url: 'https://diario.cl/nota', title: 'Una nota' })
    expect(r.ok).toBe(true)
    expect(body).toEqual({ url: 'https://diario.cl/nota', title: 'Una nota' })
  })

  it('rechaza páginas no http (chrome://, about:) sin pegarle a la red', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const r = await saveFavorito({ url: 'chrome://extensions', title: 'x' })
    expect(r.ok).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sin token → error sin red', async () => {
    installChrome('')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const r = await saveFavorito({ url: 'https://x.cl' })
    expect(r.ok).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('401 → error de token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 401 })),
    )
    const r = await saveFavorito({ url: 'https://x.cl' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/token/i)
  })

  it('sin conexión → error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    const r = await saveFavorito({ url: 'https://x.cl' })
    expect(r.ok).toBe(false)
  })
})
