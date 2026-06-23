import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiClientError,
  apiFetch,
  DuplicateEntityError,
  request,
  requestBlob,
  setApiAuthTokenProvider,
} from './request'
import { enterDemoMode, exitDemoMode } from '../lib/demo'

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

  it('preserves explicit Headers instances when building API requests', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ ok: true }, { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await request('/api/entities', {
      headers: new Headers({ 'X-Trama-Test': 'headers-instance' }),
    })

    const [, init] = fetchMock.mock.calls[0]!
    expect(new Headers(init?.headers).get('X-Trama-Test')).toBe('headers-instance')
    expect(new Headers(init?.headers).get('X-AI-Mode')).toBe('auto')
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

  it('apiFetch sirve media demo local sin tocar red', async () => {
    enterDemoMode()
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const image = await apiFetch('/api/momentos-file/demo/cuaderno.svg')
    const audio = await apiFetch('/api/momentos-file/demo/nota-voz.wav')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(image.ok).toBe(true)
    expect(image.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(await image.text()).toContain('<svg')
    expect(audio.ok).toBe(true)
    expect(audio.headers.get('Content-Type')).toBe('audio/wav')
    expect((await audio.arrayBuffer()).byteLength).toBeGreaterThan(44)
    exitDemoMode()
  })

  it('requestBlob baja media autenticada sin forzar JSON parsing', async () => {
    setApiAuthTokenProvider(async () => 'clerk-token')
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(new Blob(['media'], { type: 'image/webp' }), {
          status: 200,
          headers: { 'Content-Type': 'image/webp' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const blob = await requestBlob('/api/recortes-image/user/foto.webp')

    expect(blob.type).toBe('image/webp')
    expect(await blob.text()).toBe('media')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/recortes-image/user/foto.webp',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer clerk-token',
          'X-AI-Mode': 'auto',
        }),
      }),
    )
  })

  it('requestBlob preserva ApiClientError canónico en non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        Response.json(
          {
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Sesión requerida',
              requestId: 'rid-blob',
            },
          },
          { status: 401, headers: { 'x-request-id': 'rid-header' } },
        ),
      ),
    )

    await expect(
      requestBlob('/api/notas-attachments-file/u/a.jpg'),
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'UNAUTHENTICATED',
      status: 401,
      message: 'Sesión requerida',
      requestId: 'rid-blob',
    })
  })

  it('requestBlob sirve media demo local sin tocar red', async () => {
    enterDemoMode()
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const blob = await requestBlob('/api/momentos-file/demo/cuaderno.svg')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(blob.type).toBe('image/svg+xml')
    expect(await blob.text()).toContain('<svg')
    exitDemoMode()
  })
})

describe('request success parsing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('devuelve undefined para 204 y respuestas 2xx con body vacío', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(request('/api/notes/note-1', { method: 'DELETE' })).resolves.toBe(
      undefined,
    )
    await expect(request('/api/notes/note-1/restore', { method: 'POST' })).resolves.toBe(
      undefined,
    )
  })

  it('convierte JSON inválido de respuestas 2xx en ApiClientError trazable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        async () =>
          new Response('<html>proxy error</html>', {
            status: 200,
            headers: { 'x-request-id': 'rid-success-invalid' },
          }),
      ),
    )

    await expect(request('/api/search?q=borges')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'UNKNOWN',
      status: 200,
      message: 'GET /api/search?q=borges devolvió JSON inválido',
      requestId: 'rid-success-invalid',
    })
  })
})

describe('request error parsing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('mantiene DuplicateEntityError con el shape canónico de ApiErrors.conflict', async () => {
    const suggestions = [
      {
        id: 'e1',
        name: 'Borges',
        type: 'persona',
        description: 'escritor',
        similarity: 0.97,
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        Response.json(
          {
            error: {
              code: 'CONFLICT',
              message: 'Posible entidad duplicada',
              requestId: 'req-dup',
              details: {
                kind: 'possible_duplicate',
                suggestions,
              },
            },
          },
          { status: 409, headers: { 'x-request-id': 'req-dup' } },
        ),
      ),
    )

    await expect(
      request('/api/entities', { method: 'POST', body: '{}' }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'DuplicateEntityError',
        suggestions,
      }),
    )
    await expect(
      request('/api/entities', { method: 'POST', body: '{}' }),
    ).rejects.toBeInstanceOf(DuplicateEntityError)
  })

  it('expone code/status/details/requestId del error canónico sin leer texto legacy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        Response.json(
          {
            error: {
              code: 'VALIDATION',
              message: 'Body inválido',
              requestId: 'rid-client-contract',
              details: { issues: [{ path: 'content', message: 'Required' }] },
            },
          },
          { status: 400, headers: { 'x-request-id': 'rid-header' } },
        ),
      ),
    )

    await expect(
      request('/api/notes', { method: 'POST', body: '{}' }),
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'VALIDATION',
      status: 400,
      message: 'Body inválido',
      requestId: 'rid-client-contract',
      details: { issues: [{ path: 'content', message: 'Required' }] },
    })
    await expect(
      request('/api/notes', { method: 'POST', body: '{}' }),
    ).rejects.toBeInstanceOf(ApiClientError)
  })

  it('preserva x-request-id de header cuando el error canónico no lo incluye', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        Response.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'No existe',
            },
          },
          { status: 404, headers: { 'x-request-id': 'rid-header-only' } },
        ),
      ),
    )

    await expect(request('/api/entities/e-missing')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'NOT_FOUND',
      status: 404,
      message: 'No existe',
      requestId: 'rid-header-only',
    })
  })

  it('parsea errores legacy { error: string } sin exponer JSON crudo al usuario', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        Response.json(
          { error: 'Formato viejo pero legible', requestId: 'rid-legacy' },
          { status: 422 },
        ),
      ),
    )

    await expect(request('/api/legacy', { method: 'POST' })).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'UNKNOWN',
      status: 422,
      message: 'Formato viejo pero legible',
      requestId: 'rid-legacy',
    })
  })

  it('mantiene texto o HTML no canónico como fallback con status y requestId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        async () =>
          new Response('<!doctype html><title>Gateway</title>', {
            status: 502,
            headers: { 'x-request-id': 'rid-html' },
          }),
      ),
    )

    await expect(request('/api/search?q=borges')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'UNKNOWN',
      status: 502,
      message: '<!doctype html><title>Gateway</title>',
      requestId: 'rid-html',
    })
  })

  it('deja pasar AbortError sin envolverlo como ApiClientError', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        throw abortError
      }),
    )

    await expect(request('/api/search?q=borges')).rejects.toBe(abortError)
  })
})
