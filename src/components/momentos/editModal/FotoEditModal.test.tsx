/**
 * Smoke tests para FotoEditModal — modal de edición de momentos foto.
 * El componente tiene 7 useState + lógica compleja de upload/compress,
 * acá cubrimos solo el rendering inicial y el wiring de los botones
 * principales. La lógica de upload/compress vive en helpers/api que
 * tienen tests propios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineContext } from '../../../state/offline'
import { ToastProvider } from '../../../state/toast'
import { FotoEditModal } from './FotoEditModal'
import type { Momento } from '../../../types'

const updateMocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toastShow: vi.fn(),
}))

const derivMocks = vi.hoisted(() => ({
  momentoUpload: vi.fn(),
  compressImage: vi.fn(async (f: File) => f),
  readImageDimensions: vi.fn(async () => ({ width: 100, height: 80 })),
  createImageThumbnail: vi.fn(async (): Promise<File | null> => null),
  extractDominantColor: vi.fn(async (): Promise<string | null> => null),
}))

vi.mock('../../../api', async () => {
  const actual = await vi.importActual<typeof import('../../../api')>('../../../api')
  return {
    ...actual,
    api: { ...actual.api, momentoUpload: derivMocks.momentoUpload },
  }
})

// Parcial: solo lo que toca canvas/red — el resto de helpers sigue real.
vi.mock('../helpers', async () => {
  const actual = await vi.importActual<typeof import('../helpers')>('../helpers')
  return {
    ...actual,
    compressImage: derivMocks.compressImage,
    readImageDimensions: derivMocks.readImageDimensions,
  }
})

vi.mock('../../../lib/imageThumbnail', () => ({
  createImageThumbnail: derivMocks.createImageThumbnail,
}))

vi.mock('../../../lib/imageColor', () => ({
  extractDominantColor: derivMocks.extractDominantColor,
}))

// Solo se interceptan los hooks que el modal usa para GUARDAR; el resto del
// barrel de state sigue real (los providers del wrapper viven en módulos
// aparte y no pasan por acá).
vi.mock('../../../state', async () => {
  const actual = await vi.importActual<typeof import('../../../state')>('../../../state')
  return {
    ...actual,
    useUpdateMomento: () => ({ isPending: false, mutateAsync: updateMocks.mutateAsync }),
    useToast: () => ({ show: updateMocks.toastShow }),
  }
})

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
}

function wrap(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <OfflineContext.Provider value={{ offline: false, setOffline: () => {} }}>
          <ToastProvider>{children}</ToastProvider>
        </OfflineContext.Provider>
      </QueryClientProvider>
    )
  }
}

const FOTO_MOMENTO = {
  id: 'mom-1',
  kind: 'foto',
  capturedAt: '2026-05-28T10:00:00Z',
  note: 'una nota',
  payload: {
    photos: [{ storageKey: 'foto-1.jpg', width: 800, height: 600 }],
    primaryStorageKey: 'foto-1.jpg',
    caption: 'una foto',
  },
  links: [],
  entityIds: [],
  origin: { kind: 'manual' as const },
  createdAt: '2026-05-28T10:00:00Z',
  updatedAt: '2026-05-28T10:00:00Z',
} as unknown as Momento

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(
      async () => new Response(new Blob(['media'], { type: 'image/jpeg' })),
    ),
  )
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:foto-edit'),
      revokeObjectURL: vi.fn(),
    }),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('<FotoEditModal />', () => {
  it('renderiza el modal con los datos del momento', () => {
    const qc = makeQueryClient()
    render(<FotoEditModal momento={FOTO_MOMENTO} onClose={() => {}} />, {
      wrapper: wrap(qc),
    })
    // El caption inicial aparece en un input
    expect(screen.getByDisplayValue('una foto')).toBeInTheDocument()
    // La note inicial también
    expect(screen.getByDisplayValue('una nota')).toBeInTheDocument()
  })

  it('porta la shell del modal a body para quedar sobre las fotos del timeline', () => {
    const qc = makeQueryClient()
    render(
      <div data-testid="timeline-entry">
        <FotoEditModal momento={FOTO_MOMENTO} onClose={() => {}} />
      </div>,
      { wrapper: wrap(qc) },
    )

    const modalRoot = screen
      .getByRole('dialog', { name: /editar momento/i })
      .closest('[data-modal-root]')
    expect(modalRoot).not.toBeNull()
    expect(modalRoot?.parentElement).toBe(document.body)
  })

  it('botón "Cancelar" llama onClose', async () => {
    const onClose = vi.fn()
    const qc = makeQueryClient()
    render(<FotoEditModal momento={FOTO_MOMENTO} onClose={onClose} />, {
      wrapper: wrap(qc),
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('muestra al menos un botón "guardar" (submit) y "cancelar"', () => {
    const qc = makeQueryClient()
    render(<FotoEditModal momento={FOTO_MOMENTO} onClose={() => {}} />, {
      wrapper: wrap(qc),
    })
    expect(screen.getByRole('button', { name: /guardar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
  })

  it('guardar preserva type y posterStorageKey del clip aunque solo cambie el caption', async () => {
    // El save reconstruye items[] a mano: si olvida un campo, cada edición lo
    // borra en silencio — con `type` ya pasó (clip degradado a foto rota) y el
    // póster tiene exactamente el mismo riesgo.
    const videoMomento = {
      ...FOTO_MOMENTO,
      payload: {
        items: [
          {
            storageKey: 'u1/r2-clip.mp4',
            type: 'video',
            posterStorageKey: 'u1/poster.jpg',
            width: 1920,
            height: 1080,
          },
          {
            storageKey: 'u1/foto.jpg',
            thumbStorageKey: 'u1/foto-mini.jpg',
            dominantColor: '#334455',
          },
        ],
        caption: 'clip',
      },
    } as unknown as Momento
    updateMocks.mutateAsync.mockResolvedValue({})
    const user = userEvent.setup()
    const qc = makeQueryClient()
    render(<FotoEditModal momento={videoMomento} onClose={() => {}} />, {
      wrapper: wrap(qc),
    })

    await user.click(screen.getByRole('button', { name: /guardar/i }))

    expect(updateMocks.mutateAsync).toHaveBeenCalledTimes(1)
    const { patch } = updateMocks.mutateAsync.mock.calls[0]![0]
    expect(patch.payload.items).toEqual([
      {
        storageKey: 'u1/r2-clip.mp4',
        type: 'video',
        posterStorageKey: 'u1/poster.jpg',
        width: 1920,
        height: 1080,
      },
      // La miniatura derivada también sobrevive al re-guardado.
      {
        storageKey: 'u1/foto.jpg',
        thumbStorageKey: 'u1/foto-mini.jpg',
        dominantColor: '#334455',
      },
    ])
  })

  it('una foto NUEVA subida desde el modal deriva miniatura y color (como el composer)', async () => {
    // El hallazgo de CodeRabbit: editar también pasa por acá (editItem
    // convierte la foto a 'new'), así que sin esta derivación una foto
    // editada PERDÍA su miniatura y su color.
    updateMocks.mutateAsync.mockResolvedValue({})
    derivMocks.createImageThumbnail.mockResolvedValue(
      new File(['t'], 'thumb.jpg', { type: 'image/jpeg' }),
    )
    derivMocks.extractDominantColor.mockResolvedValue('#123456')
    derivMocks.momentoUpload
      .mockResolvedValueOnce({ storageKey: 'u1/nueva.jpg' })
      .mockResolvedValueOnce({ storageKey: 'u1/nueva-mini.jpg' })
    const user = userEvent.setup()
    const qc = makeQueryClient()
    render(<FotoEditModal momento={FOTO_MOMENTO} onClose={() => {}} />, {
      wrapper: wrap(qc),
    })

    await user.upload(
      screen.getByLabelText(/arrastra más imágenes o click para elegir/i),
      new File(['foto'], 'nueva.png', { type: 'image/png' }),
    )
    await user.click(screen.getByRole('button', { name: /guardar/i }))

    // El guardado encadena subidas async antes del mutateAsync: esperarlo.
    await waitFor(() => expect(updateMocks.mutateAsync).toHaveBeenCalled())
    // `lastCall`: los vi.fn de los factories acumulan llamadas entre tests de
    // este archivo (restoreAllMocks no los alcanza); la última es la nuestra.
    const { patch } = updateMocks.mutateAsync.mock.lastCall![0]
    const nueva = patch.payload.items.find(
      (i: { storageKey: string }) => i.storageKey === 'u1/nueva.jpg',
    )
    expect(nueva).toMatchObject({
      thumbStorageKey: 'u1/nueva-mini.jpg',
      dominantColor: '#123456',
    })
  })

  it('si el momento no tiene photos, igual renderiza la shell del modal', () => {
    const empty = {
      ...FOTO_MOMENTO,
      note: '',
      payload: {
        photos: [],
        primaryStorageKey: null,
        caption: '',
      },
    } as unknown as Momento
    const qc = makeQueryClient()
    render(<FotoEditModal momento={empty} onClose={() => {}} />, { wrapper: wrap(qc) })
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
  })

  it('revoca previews de fotos nuevas al desmontar sin guardar', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:nueva-foto')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const qc = makeQueryClient()
    const { unmount } = render(
      <FotoEditModal momento={FOTO_MOMENTO} onClose={() => {}} />,
      {
        wrapper: wrap(qc),
      },
    )

    await user.upload(
      screen.getByLabelText(/arrastra más imágenes o click para elegir/i),
      new File(['foto'], 'nueva.png', { type: 'image/png' }),
    )
    unmount()

    expect(
      createObjectURL.mock.calls.some(
        ([arg]) => arg instanceof File && arg.name === 'nueva.png',
      ),
    ).toBe(true)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:nueva-foto')
  })
})
