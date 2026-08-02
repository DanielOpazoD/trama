import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * El enrutado por tamaño de `api.momentoUpload`.
 *
 * Es la pieza que hace posible subir un video de teléfono, y su fallo es
 * silencioso en los dos sentidos:
 *
 *   - Si un archivo grande cae al camino multipart, la función lo rechaza por
 *     tamaño de body — el usuario ve "no se pudo subir" sin más pistas.
 *   - Si uno chico se va al presign, cada foto paga dos round-trips extra
 *     (firmar y completar) sin ganar nada.
 *
 * En modo prueba TODO va por multipart: no hay bucket contra el que firmar.
 */
const requestMock = vi.hoisted(() => vi.fn())
const isDemoModeMock = vi.hoisted(() => vi.fn(() => false))

vi.mock('./request', () => ({
  request: (...args: unknown[]) => requestMock(...args),
  requestBlob: vi.fn(),
}))
vi.mock('../lib/demo', () => ({
  isDemoMode: () => isDemoModeMock(),
  enterDemoMode: vi.fn(),
  exitDemoMode: vi.fn(),
  enterDemoModeFromUrl: vi.fn(),
}))

const { momentosApi } = await import('./momentos')

/** Archivo con `size` fingido: probamos un umbral, no la memoria del runner. */
function archivo(bytes: number, name = 'clip.mp4', type = 'video/mp4'): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: bytes })
  return file
}

const MB = 1024 * 1024

/** Rutas pedidas, en orden — la firma del camino que se tomó. */
function rutasLlamadas(): string[] {
  return requestMock.mock.calls.map((call) => String(call[0]))
}

beforeEach(() => {
  requestMock.mockReset()
  isDemoModeMock.mockReturnValue(false)
  requestMock.mockImplementation(async (url: string) => {
    if (url.includes('presign')) {
      return { uploadUrl: 'https://r2.example/put?sig=1', storageKey: 'u/r2-abc.mp4' }
    }
    return { storageKey: 'u/r2-abc.mp4', mime: 'video/mp4', size: 42 }
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 200 })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('momentoUpload — elección de camino', () => {
  it('un archivo chico va por multipart, sin firmar nada', async () => {
    await momentosApi.momentoUpload(archivo(2 * MB, 'foto.jpg', 'image/jpeg'))

    expect(rutasLlamadas()).toEqual(['/api/momentos-upload'])
    expect(fetch).not.toHaveBeenCalled()
  })

  /** El caso que motiva todo: 40 MB no cabe en el body de una función. */
  it('un video grande va directo a R2: presign → PUT → complete', async () => {
    await momentosApi.momentoUpload(archivo(40 * MB))

    expect(rutasLlamadas()).toEqual([
      '/api/momentos-uploads-presign',
      '/api/momentos-uploads-complete',
    ])
    // El PUT va al bucket, NO a una función de Trama.
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0]!
    expect(url).toBe('https://r2.example/put?sig=1')
    expect(init.method).toBe('PUT')
  })

  it('en modo prueba todo va por multipart aunque sea grande', async () => {
    isDemoModeMock.mockReturnValue(true)
    await momentosApi.momentoUpload(archivo(40 * MB))

    expect(rutasLlamadas()).toEqual(['/api/momentos-upload'])
    expect(fetch).not.toHaveBeenCalled()
  })

  /**
   * Un PUT fallido tiene que estallar: si se ignorara, `complete` registraría —o
   * el momento apuntaría a— un objeto que nunca llegó al bucket, y la foto
   * saldría rota mucho después, sin rastro del origen.
   */
  it('un PUT no-ok estalla y NO llama a complete', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 403 })),
    )

    await expect(momentosApi.momentoUpload(archivo(40 * MB))).rejects.toThrow(/403/)
    expect(rutasLlamadas()).toEqual(['/api/momentos-uploads-presign'])
  })

  it('el presign declara el mime y el tamaño reales', async () => {
    await momentosApi.momentoUpload(archivo(40 * MB, 'viaje.mov', 'video/quicktime'))

    const [, init] = requestMock.mock.calls[0]!
    expect(JSON.parse(init.body)).toEqual({
      mimeType: 'video/quicktime',
      byteSize: 40 * MB,
    })
  })
})
