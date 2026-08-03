import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Mock de aws4fetch: `sign` devuelve un Request cuya URL conserva la del input
 * más un marcador de firma. Así podemos verificar que la key viaja en la URL
 * firmada sin depender de credenciales reales ni de la criptografía de SigV4.
 */
const signMock = vi.fn(async (req: Request) => {
  const url = new URL(req.url)
  url.searchParams.set('X-Amz-Signature', 'fake-signature')
  return new Request(url.toString(), { method: req.method })
})

vi.mock('aws4fetch', () => ({
  AwsClient: class {
    constructor(public opts: unknown) {}
    sign = signMock
  },
}))

import {
  R2NotConfiguredError,
  isR2Configured,
  presignGet,
  presignPut,
  r2ListObjects,
  r2ObjectExists,
  r2ObjectUrl,
} from './r2'

/** Respuesta XML de un `ListObjectsV2` con las keys dadas. */
function listXml(
  keys: Array<string | { key: string; size: number }>,
  { nextToken = null as string | null, truncated = nextToken !== null } = {},
): string {
  const contents = keys
    .map((entry) => {
      const { key, size } = typeof entry === 'string' ? { key: entry, size: 10 } : entry
      return `<Contents><Key>${key}</Key><Size>${size}</Size></Contents>`
    })
    .join('')
  const token = nextToken
    ? `<NextContinuationToken>${nextToken}</NextContinuationToken>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>${truncated}</IsTruncated>${contents}${token}</ListBucketResult>`
}

function xmlResponses(...bodies: string[]) {
  const fetchMock = vi.fn(async () => new Response(bodies.shift() ?? listXml([])))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function stubR2Env(overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = {
    R2_ACCOUNT_ID: 'acc123',
    R2_ACCESS_KEY_ID: 'key123',
    R2_SECRET_ACCESS_KEY: 'secret123',
    R2_BUCKET: 'trama-biblioteca',
    ...overrides,
  }
  vi.stubGlobal('Netlify', { env: { get: (k: string) => env[k] } })
}

describe('r2 helper', () => {
  beforeEach(() => {
    signMock.mockClear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('isR2Configured es false si falta alguna env var', () => {
    stubR2Env({ R2_BUCKET: undefined })
    expect(isR2Configured()).toBe(false)
  })

  it('isR2Configured es true con las 4 env vars', () => {
    stubR2Env()
    expect(isR2Configured()).toBe(true)
  })

  it('r2ObjectUrl arma endpoint/bucket/key con segmentos codificados', () => {
    stubR2Env()
    const url = r2ObjectUrl('user-1/abc def.png')
    expect(url).toBe(
      'https://acc123.r2.cloudflarestorage.com/trama-biblioteca/user-1/abc%20def.png',
    )
    // La barra que separa userId de la key se preserva (no se escapa a %2F).
    expect(url).toContain('/user-1/')
  })

  it('presignPut firma un PUT y la key viaja en la URL firmada', async () => {
    stubR2Env()
    const signed = await presignPut('user-1/file.pdf')
    expect(signed).toContain('user-1/file.pdf')
    expect(signed).toContain('X-Amz-Signature=fake-signature')
    expect(signed).toContain('X-Amz-Expires=900')
    const [req, opts] = signMock.mock.calls[0]!
    expect((req as Request).method).toBe('PUT')
    expect(opts).toMatchObject({ aws: { signQuery: true } })
  })

  it('presignGet firma un GET', async () => {
    stubR2Env()
    await presignGet('user-1/file.pdf')
    expect((signMock.mock.calls[0]![0] as Request).method).toBe('GET')
  })

  it('lanza R2NotConfiguredError al firmar sin env vars', async () => {
    stubR2Env({ R2_ACCESS_KEY_ID: undefined })
    await expect(presignPut('user-1/file.pdf')).rejects.toBeInstanceOf(
      R2NotConfiguredError,
    )
    expect(() => r2ObjectUrl('user-1/file.pdf')).toThrow(R2NotConfiguredError)
  })

  it('r2ObjectExists devuelve exists+size desde un HEAD firmado ok', async () => {
    stubR2Env()
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 200,
          headers: { 'content-length': '4096' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await r2ObjectExists('user-1/file.pdf')
    expect(result).toEqual({ exists: true, size: 4096 })
    expect((signMock.mock.calls[0]![0] as Request).method).toBe('HEAD')
  })

  it('r2ObjectExists devuelve exists:false solo ante un 404 (objeto no existe)', async () => {
    stubR2Env()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    )
    expect(await r2ObjectExists('user-1/missing.pdf')).toEqual({
      exists: false,
      size: null,
    })
  })

  it('r2ObjectExists LANZA ante un HEAD no-404 (403/5xx no es "no existe")', async () => {
    stubR2Env()
    // 403 (firma/credenciales mal) y 503 (caída de R2) NO deben colapsar a
    // "archivo faltante": se propagan para que el wrapper devuelva un 500 claro.
    for (const status of [403, 503]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(null, { status })),
      )
      await expect(r2ObjectExists('user-1/file.pdf')).rejects.toThrow(
        `R2 HEAD falló con status ${status}`,
      )
    }
  })

  describe('r2ListObjects', () => {
    it('lista los objetos del prefijo con un ListObjectsV2 firmado', async () => {
      stubR2Env()
      const fetchMock = xmlResponses(
        listXml([{ key: 'user-1/r2-abc.mp4', size: 4096 }, 'user-1/r2-def.jpg']),
      )

      const result = await r2ListObjects('user-1/')

      expect(result).toEqual({
        objects: [
          { key: 'user-1/r2-abc.mp4', size: 4096 },
          { key: 'user-1/r2-def.jpg', size: 10 },
        ],
        truncated: false,
      })
      const url = new URL((fetchMock.mock.calls[0]![0] as Request).url)
      expect(url.searchParams.get('list-type')).toBe('2')
      expect(url.searchParams.get('prefix')).toBe('user-1/')
      // Nivel bucket, no de objeto: el path es solo /<bucket>.
      expect(url.pathname).toBe('/trama-biblioteca')
      expect((signMock.mock.calls[0]![0] as Request).method).toBe('GET')
    })

    it('pagina con continuation-token y concatena las páginas', async () => {
      stubR2Env()
      const fetchMock = xmlResponses(
        listXml(['user-1/r2-uno.mp4'], { nextToken: 'tok-2' }),
        listXml(['user-1/r2-dos.mp4']),
      )

      const result = await r2ListObjects('user-1/')

      expect(result.objects.map((o) => o.key)).toEqual([
        'user-1/r2-uno.mp4',
        'user-1/r2-dos.mp4',
      ])
      expect(result.truncated).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const segunda = new URL((fetchMock.mock.calls[1]![0] as Request).url)
      expect(segunda.searchParams.get('continuation-token')).toBe('tok-2')

      // El abort es POR PÁGINA, y se comprueba en TODAS: mirar solo la primera
      // dejaría pasar tanto una página sin signal como un único timeout
      // compartido, que abortaría las páginas siguientes antes de tiempo.
      const signals = fetchMock.mock.calls.map((c) => c[1]?.signal)
      expect(signals.every((s) => s instanceof AbortSignal)).toBe(true)
      expect(new Set(signals).size).toBe(2)
    })

    it('no sigue paginando si IsTruncated es false aunque venga token', async () => {
      stubR2Env()
      const fetchMock = xmlResponses(
        listXml(['user-1/r2-uno.mp4'], { nextToken: 'tok-2', truncated: false }),
      )

      expect((await r2ListObjects('user-1/')).truncated).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('marca truncated cuando se corta por el tope de páginas', async () => {
      stubR2Env()
      const fetchMock = xmlResponses(
        listXml(['user-1/r2-uno.mp4'], { nextToken: 'tok-2' }),
        listXml(['user-1/r2-dos.mp4'], { nextToken: 'tok-3' }),
      )

      const result = await r2ListObjects('user-1/', { maxPages: 2 })

      // Parcial y DICHO: quien consuma esto no puede afirmar "no hay más".
      expect(result.truncated).toBe(true)
      expect(result.objects).toHaveLength(2)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('decodifica las entidades XML de la key en una sola pasada', async () => {
      stubR2Env()
      xmlResponses(listXml(['user-1/a&amp;b.jpg', 'user-1/lit&amp;lt;.jpg']))

      const keys = (await r2ListObjects('user-1/')).objects.map((o) => o.key)

      expect(keys[0]).toBe('user-1/a&b.jpg')
      // Una segunda pasada dejaría `user-1/lit<.jpg`: el `&amp;` ya decodificado
      // no debe volver a interpretarse junto con lo que le sigue.
      expect(keys[1]).toBe('user-1/lit&lt;.jpg')
    })

    it('LANZA ante un LIST no-ok (no colapsa a "bucket vacío")', async () => {
      stubR2Env()
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('denied', { status: 403 })),
      )
      await expect(r2ListObjects('user-1/')).rejects.toThrow(
        'R2 LIST falló con status 403',
      )
    })

    it('lanza R2NotConfiguredError sin env vars', async () => {
      stubR2Env({ R2_BUCKET: undefined })
      await expect(r2ListObjects('user-1/')).rejects.toBeInstanceOf(R2NotConfiguredError)
    })
  })
})
