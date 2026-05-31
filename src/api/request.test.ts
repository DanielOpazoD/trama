import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, request, setApiAuthTokenProvider } from './request'

describe('request auth', () => {
  afterEach(() => {
    setApiAuthTokenProvider(null)
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('injects a Bearer token from the configured auth provider', async () => {
    setApiAuthTokenProvider(async () => 'clerk-token')
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ ok: true }, { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await request('/api/entities')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/entities',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer clerk-token',
        }),
      }),
    )
  })

  it('keeps explicit request headers authoritative', async () => {
    setApiAuthTokenProvider(async () => 'clerk-token')
    const fetchMock = vi.fn(async () => Response.json({ ok: true }, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await request('/api/entities', {
      headers: { Authorization: 'Bearer explicit-token' },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/entities',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer explicit-token',
        }),
      }),
    )
  })

  it('falls back to the legacy Clerk window bridge during transition', async () => {
    setApiAuthTokenProvider(null)
    Object.defineProperty(window, '__clerk', {
      configurable: true,
      value: {
        session: {
          getToken: vi.fn(async () => 'legacy-window-token'),
        },
      },
    })
    const fetchMock = vi.fn(async () => Response.json({ ok: true }, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await request('/api/entities')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/entities',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer legacy-window-token',
        }),
      }),
    )
  })

  it('does not force JSON Content-Type for FormData requests', async () => {
    setApiAuthTokenProvider(async () => 'clerk-token')
    const fetchMock = vi.fn(async () => Response.json({ ok: true }, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const body = new FormData()
    body.append('file', new File(['x'], 'x.jpg', { type: 'image/jpeg' }))
    await request('/api/momentos-upload', { method: 'POST', body })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/momentos-upload',
      expect.objectContaining({
        body,
        headers: expect.objectContaining({
          Authorization: 'Bearer clerk-token',
          'X-AI-Mode': 'auto',
        }),
      }),
    )
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    const [, init] = calls[0]!
    expect(init.headers).not.toHaveProperty('Content-Type')
  })

  it('apiFetch injects auth headers for streaming/raw callers', async () => {
    setApiAuthTokenProvider(async () => 'clerk-token')
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ ok: true }, { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/chat/threads/t1/messages', {
      method: 'POST',
      body: JSON.stringify({ content: 'hola' }),
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/threads/t1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer clerk-token',
          'X-AI-Mode': 'auto',
          'Content-Type': 'application/json',
        }),
      }),
    )
  })
})
