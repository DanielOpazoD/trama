import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPayload, saveRecorte } from './recorte.js'

/**
 * Armado del payload y camino de guardado. chrome.* y fetch mockeados; el
 * executeScript de meta se simula devolviendo lo configurado.
 */

/** @type {Record<string, any>} */
let store = {}
/** @type {any} */
let metaResult = null

function installChrome() {
  store = { tramaToken: 'trama_pat_x', tramaBaseUrl: 'https://api.test' }
  metaResult = null
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (keys) => {
          const ks = Array.isArray(keys) ? keys : [keys]
          const out = {}
          for (const k of ks) out[k] = store[k]
          return out
        }),
        set: vi.fn(async (obj) => Object.assign(store, obj)),
      },
    },
    action: {
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
      setTitle: vi.fn(),
    },
    alarms: { create: vi.fn(), clear: vi.fn() },
    scripting: {
      executeScript: vi.fn(async () => [{ result: metaResult }]),
    },
  }
}

beforeEach(installChrome)
afterEach(() => vi.unstubAllGlobals())

describe('buildPayload', () => {
  it('default captureMode citation y lee meta de la pestaña', async () => {
    metaResult = { author: 'Ada', title: 'Meta Title' }
    const p = await buildPayload({ text: '  hola  ', tab: { id: 1, url: 'https://s/x' } })
    expect(p.captureMode).toBe('citation')
    expect(p.sourceAuthor).toBe('Ada')
    expect(p.sourceTitle).toBe('Meta Title')
    expect(p.sourceUrl).toBe('https://s/x')
    expect(p.imageUrl).toBeNull()
    expect(p.imageKey).toBeNull()
    expect(typeof p.capturedAt).toBe('string')
  })

  it('override gana sobre los meta y NO inyecta script', async () => {
    const p = await buildPayload({
      text: 'x',
      tab: { id: 1, url: 'https://s/x', title: 'tab' },
      captureMode: 'region',
      imageKey: 'u/a.webp',
      override: { sourceUrl: 'https://o/y', sourceTitle: 'O', sourceAuthor: 'Z' },
    })
    expect(p.captureMode).toBe('region')
    expect(p.imageKey).toBe('u/a.webp')
    expect(p.sourceUrl).toBe('https://o/y')
    expect(p.sourceTitle).toBe('O')
    expect(p.sourceAuthor).toBe('Z')
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
  })

  it('recorta el texto a 20.000 caracteres', async () => {
    const p = await buildPayload({ text: 'a'.repeat(25000), override: {} })
    expect(p.text).toHaveLength(20000)
  })
})

describe('saveRecorte', () => {
  it('texto vacío → error sin pegarle a la red', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await saveRecorte({ text: '   ', override: {} })).toMatchObject({ ok: false })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('200 → ok sin encolar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    )
    const r = await saveRecorte({ text: 'hola', override: {} })
    expect(r).toEqual({ ok: true })
    expect(store.tramaQueue).toBeUndefined()
  })

  it('sin conexión → ok pero encolado para reintentar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    const r = await saveRecorte({ text: 'hola', override: {} })
    expect(r).toMatchObject({ ok: true, queued: true })
    expect(store.tramaQueue).toHaveLength(1)
    expect(store.tramaQueue[0].text).toBe('hola')
  })

  it('400 → fracaso duro, no encola', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 400 })),
    )
    const r = await saveRecorte({ text: 'hola', override: {} })
    expect(r.ok).toBe(false)
    expect(store.tramaQueue).toBeUndefined()
  })
})
