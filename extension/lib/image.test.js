import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { imageOriginPattern, saveImage } from './image.js'

/**
 * Guardado de imágenes: permiso por-dominio (primero, gesto intacto), descarga
 * del SW, y page-grab desde el content script como respaldo. chrome.permissions,
 * chrome.scripting, chrome.storage y fetch (rutas: imagen, subida, recorte)
 * mockeados.
 */

/** @type {any} */
let lastRecorteBody = null

function installChrome({ request = true, pageGrab = null } = {}) {
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
    permissions: { request: vi.fn(async () => request) },
    scripting: { executeScript: vi.fn(async () => [{ result: pageGrab }]) },
  }
}

/** Router de fetch: subida → imageKey; recorte → 200; cualquier otra (imagen,
 *  data: o page-grab) → un Blob del tipo pedido. */
function mockFetch(imageType = 'image/png') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
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
    }),
  )
}

beforeEach(() => installChrome())
afterEach(() => vi.unstubAllGlobals())

/** Cuántas veces se inyectó el extractor de imagen (no el de meta). */
function pageGrabCalls() {
  return chrome.scripting.executeScript.mock.calls.filter(
    (c) => c[0]?.func?.name === 'pageGrabImage',
  ).length
}

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

  it('pide permiso PRIMERO y, concedido, descarga con el SW (sin page-grab)', async () => {
    installChrome({ request: true })
    mockFetch('image/png')
    const r = await saveImage('https://cdn.site/foto.png', tab)
    expect(r.ok).toBe(true)
    expect(r.stored).toBe('blob')
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://cdn.site/*'],
    })
    // SW fetch alcanzó: no hizo falta el page-grab del content script.
    expect(pageGrabCalls()).toBe(0)
    expect(lastRecorteBody.imageKey).toBe('legacy/abc.webp')
    expect(lastRecorteBody.imageUrl).toBeNull()
    expect(lastRecorteBody.sourceUrl).toBe('https://blog.site/post')
    expect(lastRecorteBody.captureMode).toBe('image')
  })

  it('si el permiso se deniega, recupera la imagen desde la página (page-grab)', async () => {
    installChrome({ request: false, pageGrab: 'data:image/webp;base64,UklGR' })
    mockFetch('image/webp')
    const r = await saveImage('https://diario.cl/foto.jpg', tab)
    expect(r.stored).toBe('blob') // la consiguió igual, sin permiso
    expect(pageGrabCalls()).toBeGreaterThan(0)
    expect(lastRecorteBody.imageKey).toBe('legacy/abc.webp')
    expect(lastRecorteBody.sourceUrl).toBe('https://blog.site/post')
  })

  it('si ni el SW ni la página consiguen los bytes, cae a guardar el enlace', async () => {
    installChrome({ request: false, pageGrab: null })
    mockFetch('image/png')
    const r = await saveImage('https://diario.cl/foto.jpg', tab)
    expect(r.stored).toBe('link')
    expect(lastRecorteBody.imageUrl).toBe('https://diario.cl/foto.jpg')
    expect(lastRecorteBody.imageKey).toBeNull()
    expect(lastRecorteBody.sourceUrl).toBe('https://blog.site/post')
  })

  it('data: URL se descarga directo, sin permiso ni content script', async () => {
    installChrome()
    mockFetch('image/png')
    const r = await saveImage('data:image/png;base64,iVBOR', tab)
    expect(r.stored).toBe('blob')
    expect(chrome.permissions.request).not.toHaveBeenCalled()
    expect(pageGrabCalls()).toBe(0)
    expect(lastRecorteBody.imageKey).toBe('legacy/abc.webp')
  })
})
