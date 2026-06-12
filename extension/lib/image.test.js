import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { imageOriginPattern, saveImage } from './image.js'

/**
 * Guardado de imágenes de la web: descarga con permiso por-dominio on-demand y
 * fallback a la URL externa. chrome.permissions, chrome.storage y fetch (las
 * tres rutas: imagen, subida, recorte) mockeados.
 */

/** @type {any} */
let lastRecorteBody = null

function installChrome({ contains = false, request = true } = {}) {
  lastRecorteBody = null
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async () => ({
          tramaToken: 'trama_pat_x',
          tramaBaseUrl: 'https://api.test',
        })),
        set: vi.fn(async () => {}),
      },
    },
    action: {
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
      setTitle: vi.fn(),
    },
    alarms: { create: vi.fn(), clear: vi.fn() },
    permissions: {
      contains: vi.fn(async () => contains),
      request: vi.fn(async () => request),
    },
  }
}

/** Router de fetch: subida → imageKey; recorte → 200; cualquier otra (la
 *  imagen o data:) → un Blob del tipo pedido. */
function mockFetch(imageType = 'image/png') {
  const fn = vi.fn(async (url, init) => {
    const u = String(url)
    if (u.includes('/api/recortes-image-upload')) {
      return new Response(JSON.stringify({ imageKey: 'legacy/abc.webp' }), {
        status: 200,
      })
    }
    if (u.includes('/api/recortes')) {
      lastRecorteBody = JSON.parse(init.body)
      return new Response('{}', { status: 200 })
    }
    return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: imageType }), {
      status: 200,
    })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => installChrome())
afterEach(() => vi.unstubAllGlobals())

describe('imageOriginPattern', () => {
  it('da el patrón de origen para http/https', () => {
    expect(imageOriginPattern('https://cdn.site.com/a/b.png?x=1')).toBe(
      'https://cdn.site.com/*',
    )
    expect(imageOriginPattern('http://site.com/x.jpg')).toBe('http://site.com/*')
  })
  it('null para data:, blob: y URLs inválidas', () => {
    expect(imageOriginPattern('data:image/png;base64,xx')).toBeNull()
    expect(imageOriginPattern('blob:https://site.com/uuid')).toBeNull()
    expect(imageOriginPattern('no es una url')).toBeNull()
  })
})

describe('saveImage', () => {
  const tab = { id: 1, url: 'https://blog.site/post', title: 'Un post' }

  it('con permiso concedido descarga los bytes y guarda con imageKey', async () => {
    installChrome({ contains: false, request: true })
    mockFetch('image/png')
    const r = await saveImage('https://cdn.site/foto.png', tab)
    expect(r.ok).toBe(true)
    expect(r.stored).toBe('blob')
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://cdn.site/*'],
    })
    // El recorte guardado lleva imageKey (no la URL externa) y el link de página.
    expect(lastRecorteBody.imageKey).toBe('legacy/abc.webp')
    expect(lastRecorteBody.imageUrl).toBeNull()
    expect(lastRecorteBody.sourceUrl).toBe('https://blog.site/post')
    expect(lastRecorteBody.captureMode).toBe('image')
  })

  it('si el permiso se deniega, cae a guardar la URL externa', async () => {
    installChrome({ contains: false, request: false })
    mockFetch('image/png')
    const r = await saveImage('https://cdn.site/foto.png', tab)
    expect(r.ok).toBe(true)
    expect(r.stored).toBe('link')
    expect(lastRecorteBody.imageUrl).toBe('https://cdn.site/foto.png')
    expect(lastRecorteBody.imageKey).toBeNull()
    expect(lastRecorteBody.sourceUrl).toBe('https://blog.site/post')
  })

  it('data: URL se descarga sin pedir permiso de host', async () => {
    installChrome()
    mockFetch('image/png')
    const r = await saveImage('data:image/png;base64,iVBOR', tab)
    expect(r.stored).toBe('blob')
    expect(chrome.permissions.request).not.toHaveBeenCalled()
    expect(lastRecorteBody.imageKey).toBe('legacy/abc.webp')
  })

  it('si el recurso no es imagen soportada, cae al fallback de enlace', async () => {
    installChrome({ contains: true, request: true })
    mockFetch('text/html')
    const r = await saveImage('https://cdn.site/x', tab)
    expect(r.stored).toBe('link')
    expect(lastRecorteBody.imageUrl).toBe('https://cdn.site/x')
  })
})
