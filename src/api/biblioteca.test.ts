import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.hoisted(() => vi.fn())
const requestBlobMock = vi.hoisted(() => vi.fn())
const isDemoModeMock = vi.hoisted(() => vi.fn(() => false))

vi.mock('./request', () => ({
  request: requestMock,
  requestBlob: requestBlobMock,
}))
vi.mock('../lib/demo', () => ({
  isDemoMode: isDemoModeMock,
}))

import { bibliotecaApi } from './biblioteca'
import type { LibraryItem } from '../types/biblioteca'

/** Item camelCase mínimo (lo que devuelven los endpoints de subida). */
function item(over: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'library-upload:a1',
    kind: 'library-upload',
    itemId: 'a1',
    title: 'archivo',
    fileType: 'other',
    source: 'subido',
    mimeType: 'application/pdf',
    byteSize: 10,
    storageKey: 'u/a1.pdf',
    storageDomain: 'library-uploads',
    tags: [],
    pinned: false,
    aiStatus: null,
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
    ...over,
  }
}

/** Crea un File de tamaño `size` sin asignar tanta memoria (mockea .size). */
function fileOfSize(name: string, type: string, size: number): File {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const SMALL = 1 * 1024 * 1024 // 1 MB → multipart
const LARGE = 10 * 1024 * 1024 // 10 MB → R2

beforeEach(() => {
  requestMock.mockReset()
  requestBlobMock.mockReset()
  isDemoModeMock.mockReturnValue(false)
  vi.unstubAllGlobals()
})

describe('bibliotecaApi list/download contracts', () => {
  it('lista biblioteca con query estable y transforma filas snake_case a LibraryItem', async () => {
    requestMock.mockResolvedValueOnce({
      items: [
        {
          item_kind: 'library-upload',
          item_id: 'lib-1',
          title: 'Cuaderno.pdf',
          file_type: 'pdf',
          source: 'subido',
          mime_type: 'application/pdf',
          byte_size: 2048,
          storage_key: 'user a/cuaderno final.pdf',
          storage_domain: 'library-uploads',
          tags: ['lectura'],
          pinned: true,
          ai_status: 'pending',
          created_at: '2026-06-22T00:00:00.000Z',
          updated_at: '2026-06-22T00:01:00.000Z',
        },
      ],
      nextCursor: 'cursor-2',
    })

    await expect(
      bibliotecaApi.list({
        q: 'borges',
        tab: 'archivos',
        tag: 'lectura',
        limit: 25,
        cursor: 'cursor-1',
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'library-upload:lib-1',
          kind: 'library-upload',
          itemId: 'lib-1',
          mimeType: 'application/pdf',
          byteSize: 2048,
          storageKey: 'user a/cuaderno final.pdf',
          storageDomain: 'library-uploads',
          aiStatus: 'pending',
          createdAt: '2026-06-22T00:00:00.000Z',
          updatedAt: '2026-06-22T00:01:00.000Z',
        }),
      ],
      nextCursor: 'cursor-2',
    })
    expect(requestMock).toHaveBeenCalledWith(
      '/api/biblioteca?q=borges&tab=archivos&tag=lectura&limit=25&cursor=cursor-1',
    )
  })

  it('descarga blobs privados con requestBlob y nombre del item', async () => {
    const objectUrl = 'blob:library-download'
    requestBlobMock.mockResolvedValueOnce(new Blob(['pdf'], { type: 'application/pdf' }))
    const createObjectURL = vi.fn(() => objectUrl)
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const clicked: string[] = []
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const element = originalCreateElement(tagName)
      if (tagName === 'a') {
        Object.defineProperty(element, 'click', {
          configurable: true,
          value: () => clicked.push((element as HTMLAnchorElement).download),
        })
      }
      return element
    })

    await bibliotecaApi.download(
      item({
        title: 'Cuaderno.pdf',
        storageKey: 'user a/cuaderno final.pdf',
        storageDomain: 'library-uploads',
      }),
    )

    expect(requestBlobMock).toHaveBeenCalledWith(
      '/api/library-uploads-file/user%20a/cuaderno%20final.pdf',
    )
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(clicked).toEqual(['Cuaderno.pdf'])
  })
})

describe('bibliotecaApi.upload — enrutamiento por tamaño', () => {
  it('archivo ≤4 MB usa el camino multipart (POST /api/library-uploads)', async () => {
    requestMock.mockResolvedValueOnce({ items: [item({ itemId: 's1' })], failed: [] })

    const file = fileOfSize('chico.pdf', 'application/pdf', SMALL)
    const res = await bibliotecaApi.upload([{ file }])

    expect(res.items).toHaveLength(1)
    expect(res.items[0]!.itemId).toBe('s1')
    expect(requestMock).toHaveBeenCalledTimes(1)
    const [url, init] = requestMock.mock.calls[0]!
    expect(url).toBe('/api/library-uploads')
    expect((init as RequestInit).body).toBeInstanceOf(FormData)
  })

  it('archivo >4 MB usa el camino R2 (presign → PUT → complete)', async () => {
    requestMock
      .mockResolvedValueOnce({
        uploadUrl: 'https://r2.example/u/big.mp4?sig=1',
        storageKey: 'u/big.mp4',
      })
      .mockResolvedValueOnce({ item: item({ itemId: 'r1', mimeType: 'video/mp4' }) })

    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(null, { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const file = fileOfSize('big.mp4', 'video/mp4', LARGE)
    const res = await bibliotecaApi.upload([
      { file, takenAt: '2026-06-01T00:00:00.000Z' },
    ])

    expect(res.items).toHaveLength(1)
    expect(res.items[0]!.itemId).toBe('r1')
    expect(res.failed).toHaveLength(0)

    // presign + complete (dos requests), y un PUT directo a R2 (fetch).
    expect(requestMock).toHaveBeenNthCalledWith(
      1,
      '/api/library-uploads-presign',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      2,
      '/api/library-uploads-complete',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://r2.example/u/big.mp4?sig=1',
      expect.objectContaining({ method: 'PUT' }),
    )
    // El PUT lleva el body crudo y el Content-Type del archivo.
    const putInit = fetchMock.mock.calls[0]![1]!
    expect(putInit.body).toBe(file)
    expect((putInit.headers as Record<string, string>)['Content-Type']).toBe('video/mp4')
  })

  it('un PUT fallido manda ese archivo a failed (sin tumbar al resto)', async () => {
    requestMock.mockResolvedValueOnce({
      uploadUrl: 'https://r2.example/u/big.mp4?sig=1',
      storageKey: 'u/big.mp4',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 403 })),
    )

    const file = fileOfSize('big.mp4', 'video/mp4', LARGE)
    const res = await bibliotecaApi.upload([{ file }])

    expect(res.items).toHaveLength(0)
    expect(res.failed).toHaveLength(1)
    expect(res.failed[0]!.name).toBe('big.mp4')
    // No debe llamarse a complete si el PUT falló.
    expect(requestMock).toHaveBeenCalledTimes(1)
  })

  it('si presign falla (R2 no configurado) el mensaje llega a failed', async () => {
    requestMock.mockRejectedValueOnce(
      new Error('Almacenamiento de archivos grandes no configurado (R2)'),
    )
    const file = fileOfSize('big.mp4', 'video/mp4', LARGE)
    const res = await bibliotecaApi.upload([{ file }])
    expect(res.failed[0]!.message).toContain('R2')
  })

  it('en modo prueba TODO va por multipart, incluso archivos grandes', async () => {
    isDemoModeMock.mockReturnValue(true)
    requestMock.mockResolvedValueOnce({ items: [item({ itemId: 'd1' })], failed: [] })

    const file = fileOfSize('big.mp4', 'video/mp4', LARGE)
    const res = await bibliotecaApi.upload([{ file }])

    expect(res.items[0]!.itemId).toBe('d1')
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(requestMock.mock.calls[0]![0]).toBe('/api/library-uploads')
  })
})
