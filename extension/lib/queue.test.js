import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enqueue, flushQueue, sendPayload } from './queue.js'

/**
 * Cola offline + clasificación de respuestas del backend. Se mockean
 * chrome.storage.local (en memoria), chrome.action, chrome.alarms y fetch.
 */

/** @type {Record<string, any>} */
let store = {}

function installChrome() {
  store = { tramaToken: 'trama_pat_x', tramaBaseUrl: 'https://api.test' }
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (keys) => {
          const ks = Array.isArray(keys) ? keys : [keys]
          const out = {}
          for (const k of ks) out[k] = store[k]
          return out
        }),
        set: vi.fn(async (obj) => {
          Object.assign(store, obj)
        }),
      },
    },
    action: {
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
      setTitle: vi.fn(),
    },
    alarms: { create: vi.fn(), clear: vi.fn() },
  }
}

beforeEach(installChrome)
afterEach(() => vi.unstubAllGlobals())

const payload = { text: 'hola', captureMode: 'citation' }

describe('sendPayload', () => {
  it('200 → ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    )
    expect(await sendPayload(payload)).toEqual({ ok: true })
  })

  it('401 → reintentable (token inválido)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 401 })),
    )
    expect(await sendPayload(payload)).toMatchObject({ ok: false, retryable: true })
  })

  it('500 → reintentable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    )
    expect(await sendPayload(payload)).toMatchObject({ ok: false, retryable: true })
  })

  it('400 → NO reintentable (payload inválido)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 400 })),
    )
    expect(await sendPayload(payload)).toMatchObject({ ok: false, retryable: false })
  })

  it('red caída → reintentable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network')
      }),
    )
    expect(await sendPayload(payload)).toMatchObject({ ok: false, retryable: true })
  })

  it('sin token → reintentable sin pegarle a la red', async () => {
    delete store.tramaToken
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await sendPayload(payload)).toMatchObject({ ok: false, retryable: true })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('cola', () => {
  it('enqueue acumula en storage y programa el alarm', async () => {
    await enqueue(payload)
    await enqueue({ ...payload, text: 'dos' })
    expect(store.tramaQueue).toHaveLength(2)
    expect(chrome.alarms.create).toHaveBeenCalledWith('trama-flush', {
      periodInMinutes: 1,
    })
  })

  it('flushQueue envía los pendientes y vacía al lograrse', async () => {
    store.tramaQueue = [payload, { ...payload, text: 'dos' }]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    )
    await flushQueue()
    expect(store.tramaQueue).toHaveLength(0)
    expect(chrome.alarms.clear).toHaveBeenCalledWith('trama-flush')
  })

  it('flushQueue descarta los 400 pero conserva los reintentables', async () => {
    store.tramaQueue = [
      { ...payload, text: 'invalido' },
      { ...payload, text: 'reintentar' },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body)
        return new Response('', { status: body.text === 'invalido' ? 400 : 503 })
      }),
    )
    await flushQueue()
    // El 400 se descarta; el 503 (reintentable) sigue en la cola.
    expect(store.tramaQueue).toHaveLength(1)
    expect(store.tramaQueue[0].text).toBe('reintentar')
  })
})
