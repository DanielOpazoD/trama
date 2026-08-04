import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMomentoComposer } from './useMomentoComposer'
import type { Momento } from '../../types'

const mocks = vi.hoisted(() => ({
  addMomento: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
  toastShow: vi.fn(),
  momentoUrlPreview: vi.fn(),
  momentoUpload: vi.fn(),
  momentoAudioUpload: vi.fn(),
  compressImage: vi.fn(),
  readImageDimensions: vi.fn(),
  readVideoDimensions: vi.fn(),
  captureVideoPoster: vi.fn(),
  createImageThumbnail: vi.fn(),
  extractPhotoCapturedAtFromFile: vi.fn(),
}))

vi.mock('../../state', () => ({
  useAddMomento: () => mocks.addMomento,
  useToast: () => ({ show: mocks.toastShow }),
}))

vi.mock('../../api', () => ({
  api: {
    momentoUrlPreview: mocks.momentoUrlPreview,
    momentoUpload: mocks.momentoUpload,
    momentoAudioUpload: mocks.momentoAudioUpload,
  },
}))

vi.mock('./helpers', async () => {
  // Parcial: conservamos las funciones puras reales (isVideoFile,
  // MAX_MEDIA_BYTES) y solo mockeamos las que tocan canvas/red o esperan
  // eventos de media que jsdom nunca dispara (readVideoDimensions).
  const actual = await vi.importActual<typeof import('./helpers')>('./helpers')
  return {
    ...actual,
    compressImage: mocks.compressImage,
    readImageDimensions: mocks.readImageDimensions,
    readVideoDimensions: mocks.readVideoDimensions,
  }
})

// jsdom no decodifica video: el módulo real quedaría esperando `loadedmetadata`
// hasta su timeout. El test cubre el CABLEADO (captura → subida → item).
vi.mock('./captureVideoPoster', () => ({
  captureVideoPoster: mocks.captureVideoPoster,
}))

// jsdom tampoco decodifica imágenes: mismo trato que el póster.
vi.mock('../../lib/imageThumbnail', () => ({
  createImageThumbnail: mocks.createImageThumbnail,
}))

vi.mock('../../lib/photoExif', async () => {
  const actual =
    await vi.importActual<typeof import('../../lib/photoExif')>('../../lib/photoExif')
  return {
    ...actual,
    extractPhotoCapturedAtFromFile: mocks.extractPhotoCapturedAtFromFile,
  }
})

function imageFile(name = 'foto.png') {
  return new File(['image-bytes'], name, { type: 'image/png' })
}

function audioFile(name = 'voz.mp3') {
  return new File(['audio-bytes'], name, { type: 'audio/mpeg' })
}

function momento(overrides: Partial<Momento> = {}): Momento {
  return {
    id: 'momento-1',
    kind: 'nota',
    capturedAt: '2026-05-31T10:00:00.000Z',
    payload: { bodyText: 'creado' },
    origin: { kind: 'manual' },
    entityIds: [],
    createdAt: '2026-05-31T10:00:00.000Z',
    updatedAt: '2026-05-31T10:00:00.000Z',
    ...overrides,
  }
}

describe('useMomentoComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.addMomento.isPending = false
    mocks.addMomento.mutateAsync.mockResolvedValue(momento())
    mocks.momentoUrlPreview.mockResolvedValue({ fetched: true })
    mocks.momentoUpload.mockResolvedValue({ storageKey: 'img-key' })
    mocks.momentoAudioUpload.mockResolvedValue({ storageKey: 'audio-key' })
    mocks.compressImage.mockImplementation(async (file: File) => file)
    mocks.readImageDimensions.mockResolvedValue({ width: 1200, height: 800 })
    mocks.extractPhotoCapturedAtFromFile.mockResolvedValue(null)
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn((value: Blob) => `blob:${(value as File).name}`),
        revokeObjectURL: vi.fn(),
      }),
    )
  })

  it('agrega un video corto como draft marcado isVideo', () => {
    const { result } = renderHook(() => useMomentoComposer({}))
    const clip = new File(['tiny'], 'clip.mp4', { type: 'video/mp4' })
    act(() => result.current.addPhotoFiles([clip]))
    expect(result.current.photoDrafts).toHaveLength(1)
    expect(result.current.photoDrafts[0]?.isVideo).toBe(true)
  })

  /**
   * El tope se declara en bytes pero se comprueba contra `file.size`, así que
   * fingimos el tamaño en vez de reservar cientos de MB de verdad: un test no
   * debería costar memoria real para probar un número.
   */
  function videoDeTamano(bytes: number, name = 'clip.mp4'): File {
    const file = new File(['x'], name, { type: 'video/mp4' })
    Object.defineProperty(file, 'size', { value: bytes })
    return file
  }

  /**
   * El caso que motiva la subida directa a R2: 40 MB es un video de teléfono
   * normal y ANTES se rechazaba, porque el tope era el del body de una Netlify
   * Function (10 MB). Si alguien vuelve a bajar `MAX_MEDIA_BYTES` a ese valor,
   * este test lo dice.
   */
  it('acepta un video de 40 MB — el tope ya no es el del body de la función', () => {
    const { result } = renderHook(() => useMomentoComposer({}))
    act(() => result.current.addPhotoFiles([videoDeTamano(40 * 1024 * 1024)]))
    expect(result.current.photoDrafts).toHaveLength(1)
    expect(result.current.photoDrafts[0]?.isVideo).toBe(true)
    expect(mocks.toastShow).not.toHaveBeenCalled()
  })

  it('rechaza un video que supera el tope de tamaño y avisa con un toast', () => {
    const { result } = renderHook(() => useMomentoComposer({}))
    // Por encima de MAX_MEDIA_BYTES (200 MB): el composer no lo agrega.
    act(() => result.current.addPhotoFiles([videoDeTamano(201 * 1024 * 1024)]))
    expect(mocks.toastShow).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'error' }),
    )
    expect(result.current.photoDrafts).toHaveLength(0)
  })

  it('rechaza un formato de video no soportado (p. ej. avi) con un aviso', () => {
    const { result } = renderHook(() => useMomentoComposer({}))
    const avi = new File(['x'], 'clip.avi', { type: 'video/x-msvideo' })
    act(() => result.current.addPhotoFiles([avi]))
    expect(mocks.toastShow).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'error' }),
    )
    expect(result.current.photoDrafts).toHaveLength(0)
  })

  it('revoca previews de foto y audio al desmontar el composer', () => {
    const { result, unmount } = renderHook(() => useMomentoComposer({}))

    act(() => {
      result.current.addPhotoFiles([
        imageFile('familia.png'),
        new File(['txt'], 'nota.txt', { type: 'text/plain' }),
      ])
      result.current.setAudioFile(audioFile())
    })

    expect(result.current.photoDrafts).toHaveLength(1)
    expect(result.current.photoDrafts[0]?.previewUrl).toBe('blob:familia.png')
    expect(result.current.audioDraft?.previewUrl).toBe('blob:voz.mp3')

    unmount()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:familia.png')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voz.mp3')
  })

  it('replacePhotoDraft intercambia el archivo y revoca el preview viejo', () => {
    const { result } = renderHook(() => useMomentoComposer({}))

    act(() => {
      result.current.addPhotoFiles([imageFile('vieja.png')])
    })
    expect(result.current.photoDrafts[0]?.previewUrl).toBe('blob:vieja.png')

    const edited = new File(['edit'], 'editada.webp', { type: 'image/webp' })
    act(() => {
      result.current.replacePhotoDraft(0, edited)
    })

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vieja.png')
    expect(result.current.photoDrafts).toHaveLength(1)
    expect(result.current.photoDrafts[0]?.file).toBe(edited)
    expect(result.current.photoDrafts[0]?.previewUrl).toBe('blob:editada.webp')
  })

  it('crea una nota con texto normalizado y resetea el draft', async () => {
    const onCreated = vi.fn()
    const created = momento({ id: 'nota-creada' })
    mocks.addMomento.mutateAsync.mockResolvedValueOnce(created)
    const { result } = renderHook(() => useMomentoComposer({ onCreated }))

    act(() => {
      result.current.setNoteDraft('  una escena recordada  ')
    })
    await act(async () => {
      await result.current.submit()
    })

    expect(mocks.addMomento.mutateAsync).toHaveBeenCalledWith({
      kind: 'nota',
      payload: { bodyText: 'una escena recordada' },
    })
    expect(result.current.noteDraft).toBe('')
    expect(onCreated).toHaveBeenCalledWith(created)
  })

  it('completa preview de recorte sin pisar campos editados manualmente', async () => {
    mocks.momentoUrlPreview.mockResolvedValueOnce({
      fetched: false,
      title: 'Título externo',
      description: 'Descripción externa',
      source: 'Revista',
      author: 'Autora',
    })
    const { result } = renderHook(() => useMomentoComposer({ initialKind: 'recorte' }))

    act(() => {
      result.current.setRecorteUrl(' https://trama.test/articulo ')
      result.current.setRecorteTitle('Título propio')
    })
    await act(async () => {
      await result.current.fetchPreview()
    })

    expect(mocks.momentoUrlPreview).toHaveBeenCalledWith('https://trama.test/articulo')
    expect(result.current.recorteTitle).toBe('Título propio')
    expect(result.current.recorteBody).toBe('Descripción externa')
    expect(result.current.recorteSource).toBe('Revista')
    expect(result.current.recorteAuthor).toBe('Autora')
    expect(mocks.toastShow).toHaveBeenCalledWith({
      message: 'No se pudo extraer info de la URL. Completa los campos a mano.',
      tone: 'default',
    })
  })

  it('sube fotos y audio, conserva el orden elegido y limpia el estado', async () => {
    mocks.momentoUpload.mockImplementation(async (file: File) => ({
      storageKey: `key:${file.name}`,
    }))
    mocks.momentoAudioUpload.mockImplementation(async (file: File) => ({
      storageKey: `audio:${file.name}`,
    }))
    const created = momento({ id: 'foto-creada', kind: 'foto' })
    mocks.addMomento.mutateAsync.mockResolvedValueOnce(created)
    const onCreated = vi.fn()
    const { result } = renderHook(() =>
      useMomentoComposer({ initialKind: 'foto', onCreated }),
    )

    act(() => {
      result.current.addPhotoFiles([imageFile('a.png'), imageFile('b.png')])
      result.current.setPrimaryPhoto(1)
      result.current.setPhotoCaption('  Patio  ')
      result.current.setPhotoNote('  sábado  ')
      result.current.setAudioFile(audioFile('voz.mp3'))
    })
    await act(async () => {
      await result.current.submit()
    })

    expect(mocks.momentoUpload).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: 'b.png' }),
    )
    expect(mocks.momentoUpload).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: 'a.png' }),
    )
    expect(mocks.addMomento.mutateAsync).toHaveBeenCalledWith({
      kind: 'foto',
      payload: {
        items: [
          { storageKey: 'key:b.png', width: 1200, height: 800 },
          { storageKey: 'key:a.png', width: 1200, height: 800 },
        ],
        storageKey: 'key:b.png',
        width: 1200,
        height: 800,
        caption: 'Patio',
        audioKey: 'audio:voz.mp3',
      },
      note: 'sábado',
    })
    expect(result.current.photoDrafts).toEqual([])
    expect(result.current.audioDraft).toBeNull()
    expect(result.current.photoUploadProgress).toBeNull()
    expect(onCreated).toHaveBeenCalledWith(created)
  })

  it('sugiere la fecha EXIF más antigua y la envía como capturedAt al guardar foto', async () => {
    mocks.extractPhotoCapturedAtFromFile.mockImplementation(async (file: File) => {
      if (file.name === 'a.jpg') return '2026-06-20T14:00:00.000'
      if (file.name === 'b.jpg') return '2026-06-19T23:10:00.000'
      return null
    })
    const { result } = renderHook(() => useMomentoComposer({ initialKind: 'foto' }))

    await act(async () => {
      result.current.addPhotoFiles([
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
      ])
    })

    expect(result.current.photoCapturedAtSuggestion).toBe('2026-06-19T23:10:00.000')
    expect(result.current.photoDateMode).toBe('photo')

    await act(async () => {
      await result.current.submit()
    })

    expect(mocks.addMomento.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'foto',
        capturedAt: '2026-06-19T23:10:00.000',
      }),
    )
  })

  it('espera la lectura EXIF pendiente antes de guardar una foto subida desde archivo', async () => {
    let resolveExif: (value: string) => void = () => {}
    const exifPending = new Promise<string>((resolve) => {
      resolveExif = resolve
    })
    mocks.extractPhotoCapturedAtFromFile.mockReturnValueOnce(exifPending)
    const { result } = renderHook(() => useMomentoComposer({ initialKind: 'foto' }))

    act(() => {
      result.current.addPhotoFiles([new File(['a'], 'a.jpg', { type: 'image/jpeg' })])
    })

    const submitPromise = result.current.submit()
    await Promise.resolve()
    expect(mocks.addMomento.mutateAsync).not.toHaveBeenCalled()

    resolveExif('2026-06-19T23:10:00.000')
    await act(async () => {
      await submitPromise
    })

    expect(mocks.addMomento.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'foto',
        capturedAt: '2026-06-19T23:10:00.000',
      }),
    )
  })

  it('permite descartar la fecha EXIF y mantener el comportamiento actual', async () => {
    mocks.extractPhotoCapturedAtFromFile.mockResolvedValueOnce('2026-06-19T23:10:00.000')
    const { result } = renderHook(() => useMomentoComposer({ initialKind: 'foto' }))

    await act(async () => {
      result.current.addPhotoFiles([new File(['a'], 'a.jpg', { type: 'image/jpeg' })])
    })
    act(() => {
      result.current.setPhotoDateMode('now')
    })
    await act(async () => {
      await result.current.submit()
    })

    expect(mocks.addMomento.mutateAsync).toHaveBeenCalledWith(
      expect.not.objectContaining({ capturedAt: expect.any(String) }),
    )
  })

  it('envía fecha personalizada aunque la imagen no tenga EXIF', async () => {
    mocks.extractPhotoCapturedAtFromFile.mockResolvedValueOnce(null)
    const { result } = renderHook(() => useMomentoComposer({ initialKind: 'foto' }))

    await act(async () => {
      result.current.addPhotoFiles([
        new File(['a'], 'sin-exif.jpg', { type: 'image/jpeg' }),
      ])
    })
    act(() => {
      result.current.setPhotoDateMode('custom')
      result.current.setCustomPhotoCapturedAt('2026-07-04T09:30')
    })
    await act(async () => {
      await result.current.submit()
    })

    expect(mocks.addMomento.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'foto',
        capturedAt: new Date('2026-07-04T09:30').toISOString(),
      }),
    )
  })

  describe('miniatura derivada de foto', () => {
    beforeEach(() => {
      mocks.extractPhotoCapturedAtFromFile.mockResolvedValue(null)
      mocks.compressImage.mockImplementation(async (f: File) => f)
      mocks.readImageDimensions.mockResolvedValue({ width: 2000, height: 1500 })
      mocks.addMomento.mutateAsync.mockResolvedValue(momento({ kind: 'foto' }))
    })

    it('deriva la miniatura, la sube y la guarda en el item', async () => {
      mocks.createImageThumbnail.mockResolvedValue(
        new File(['thumb'], 'thumb.jpg', { type: 'image/jpeg' }),
      )
      mocks.momentoUpload
        .mockResolvedValueOnce({ storageKey: 'u1/original.jpg' })
        .mockResolvedValueOnce({ storageKey: 'u1/thumb.jpg' })
      const { result } = renderHook(() => useMomentoComposer({ initialKind: 'foto' }))

      await act(async () => {
        result.current.addPhotoFiles([new File(['a'], 'a.jpg', { type: 'image/jpeg' })])
      })
      await act(async () => {
        await result.current.submit()
      })

      expect(mocks.momentoUpload).toHaveBeenCalledTimes(2)
      expect(mocks.addMomento.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            items: [
              expect.objectContaining({
                storageKey: 'u1/original.jpg',
                thumbStorageKey: 'u1/thumb.jpg',
              }),
            ],
          }),
        }),
      )
    })

    it('si la derivación da null (foto ya chica), sube solo el original', async () => {
      mocks.createImageThumbnail.mockResolvedValue(null)
      mocks.momentoUpload.mockResolvedValueOnce({ storageKey: 'u1/chica.jpg' })
      const { result } = renderHook(() => useMomentoComposer({ initialKind: 'foto' }))

      await act(async () => {
        result.current.addPhotoFiles([new File(['a'], 'a.jpg', { type: 'image/jpeg' })])
      })
      await act(async () => {
        await result.current.submit()
      })

      expect(mocks.momentoUpload).toHaveBeenCalledTimes(1)
      const item = mocks.addMomento.mutateAsync.mock.calls[0]![0].payload.items[0]
      expect(item.thumbStorageKey).toBeUndefined()
    })
  })

  describe('póster de video', () => {
    function videoFile(name = 'clip.mp4') {
      return new File(['video-bytes'], name, { type: 'video/mp4' })
    }

    beforeEach(() => {
      mocks.extractPhotoCapturedAtFromFile.mockResolvedValue(null)
      mocks.readVideoDimensions.mockResolvedValue({ width: 1920, height: 1080 })
      mocks.addMomento.mutateAsync.mockResolvedValue(momento({ kind: 'foto' }))
    })

    it('captura el póster, lo sube y lo guarda en el item del clip', async () => {
      mocks.captureVideoPoster.mockResolvedValue(
        new File(['poster'], 'poster.jpg', { type: 'image/jpeg' }),
      )
      // Primera subida: el clip. Segunda: el póster.
      mocks.momentoUpload
        .mockResolvedValueOnce({ storageKey: 'u1/r2-clip.mp4' })
        .mockResolvedValueOnce({ storageKey: 'u1/poster.jpg' })
      const { result } = renderHook(() => useMomentoComposer({ initialKind: 'foto' }))

      await act(async () => {
        result.current.addPhotoFiles([videoFile()])
      })
      await act(async () => {
        await result.current.submit()
      })

      expect(mocks.momentoUpload).toHaveBeenCalledTimes(2)
      expect(mocks.addMomento.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            items: [
              {
                storageKey: 'u1/r2-clip.mp4',
                width: 1920,
                height: 1080,
                type: 'video',
                posterStorageKey: 'u1/poster.jpg',
              },
            ],
          }),
        }),
      )
    })

    it('si la captura devuelve null, el clip entra sin póster y sin subida extra', async () => {
      mocks.captureVideoPoster.mockResolvedValue(null)
      mocks.momentoUpload.mockResolvedValueOnce({ storageKey: 'u1/r2-clip.mp4' })
      const { result } = renderHook(() => useMomentoComposer({ initialKind: 'foto' }))

      await act(async () => {
        result.current.addPhotoFiles([videoFile()])
      })
      await act(async () => {
        await result.current.submit()
      })

      expect(mocks.momentoUpload).toHaveBeenCalledTimes(1)
      const item = mocks.addMomento.mutateAsync.mock.calls[0]![0].payload.items[0]
      expect(item.storageKey).toBe('u1/r2-clip.mp4')
      expect(item.posterStorageKey).toBeUndefined()
    })

    it('si la SUBIDA del póster falla, el episodio se crea igual (best-effort)', async () => {
      mocks.captureVideoPoster.mockResolvedValue(
        new File(['poster'], 'poster.jpg', { type: 'image/jpeg' }),
      )
      mocks.momentoUpload
        .mockResolvedValueOnce({ storageKey: 'u1/r2-clip.mp4' })
        .mockRejectedValueOnce(new Error('red caída'))
      const { result } = renderHook(() => useMomentoComposer({ initialKind: 'foto' }))

      await act(async () => {
        result.current.addPhotoFiles([videoFile()])
      })
      await act(async () => {
        await result.current.submit()
      })

      expect(mocks.addMomento.mutateAsync).toHaveBeenCalledTimes(1)
      const item = mocks.addMomento.mutateAsync.mock.calls[0]![0].payload.items[0]
      expect(item.posterStorageKey).toBeUndefined()
      expect(mocks.toastShow).not.toHaveBeenCalledWith(
        expect.objectContaining({ tone: 'error' }),
      )
    })
  })
})
