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

vi.mock('./helpers', () => ({
  compressImage: mocks.compressImage,
  readImageDimensions: mocks.readImageDimensions,
}))

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
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn((value: Blob) => `blob:${(value as File).name}`),
        revokeObjectURL: vi.fn(),
      }),
    )
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
})
