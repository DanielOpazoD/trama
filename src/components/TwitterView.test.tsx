import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type XBookmark } from '../api'
import type { ExtractionProposal } from '../types'
import { renderWithProviders } from '../test-utils'
import { TwitterView } from './TwitterView'

const stateMocks = vi.hoisted(() => ({
  status: vi.fn(),
  bookmarks: vi.fn(),
  deleteBookmark: vi.fn(),
  classifyBookmarks: vi.fn(),
  cronica: vi.fn(),
  generateCronica: vi.fn(),
  extract: vi.fn(),
  createNote: vi.fn(),
}))

vi.mock('../state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../state')>()
  return {
    ...actual,
    useXStatusQuery: stateMocks.status,
    useTwitterBookmarksQuery: stateMocks.bookmarks,
    useDeleteBookmark: stateMocks.deleteBookmark,
    useClassifyBookmarks: stateMocks.classifyBookmarks,
    useXCronicaQuery: stateMocks.cronica,
    useGenerateXCronica: stateMocks.generateCronica,
    useExtract: stateMocks.extract,
    useCreateNote: stateMocks.createNote,
  }
})

const BOOKMARKS: XBookmark[] = [
  {
    id: 'b1',
    tweetId: 'tw1',
    text: 'Un hilo sobre memoria y ciudades',
    authorName: 'Alicia',
    authorUsername: 'alice',
    tweetCreatedAt: '2026-05-10T10:00:00Z',
    url: 'https://x.com/alice/status/1',
    capturedAt: '2026-05-10T11:00:00Z',
    topic: 'memoria',
  },
  {
    id: 'b2',
    tweetId: 'tw2',
    text: 'Notas sobre música generativa',
    authorName: 'Bruno',
    authorUsername: 'bruno',
    tweetCreatedAt: '2025-02-03T10:00:00Z',
    url: 'https://x.com/bruno/status/2',
    capturedAt: '2025-02-03T11:00:00Z',
    topic: null,
  },
]

function setTwitterMocks({
  connected = true,
  items = BOOKMARKS,
  classify = vi.fn().mockResolvedValue({ classified: 1, remaining: false }),
  generate = vi.fn().mockResolvedValue({}),
  extract = vi.fn().mockResolvedValue({ entities: [] } as unknown as ExtractionProposal),
  createNote = vi.fn().mockResolvedValue({}),
  deleteBookmark = vi.fn(),
}: {
  connected?: boolean
  items?: XBookmark[]
  classify?: ReturnType<typeof vi.fn>
  generate?: ReturnType<typeof vi.fn>
  extract?: ReturnType<typeof vi.fn>
  createNote?: ReturnType<typeof vi.fn>
  deleteBookmark?: ReturnType<typeof vi.fn>
} = {}) {
  stateMocks.status.mockReturnValue({
    isLoading: false,
    data: connected
      ? {
          connected: true,
          username: 'dani',
          xUserId: 'x-1',
          lastSyncedAt: '2026-05-31T10:00:00Z',
          counts: { totalBookmarks: items.length },
        }
      : { connected: false },
  })
  stateMocks.bookmarks.mockReturnValue({
    isLoading: false,
    data: { items },
  })
  stateMocks.deleteBookmark.mockReturnValue({ mutate: deleteBookmark, isPending: false })
  stateMocks.classifyBookmarks.mockReturnValue({
    mutateAsync: classify,
    isPending: false,
  })
  stateMocks.cronica.mockReturnValue({ data: { cronica: null } })
  stateMocks.generateCronica.mockReturnValue({ mutateAsync: generate, isPending: false })
  stateMocks.extract.mockReturnValue({ mutateAsync: extract })
  stateMocks.createNote.mockReturnValue({ mutateAsync: createNote })
  return { classify, generate, extract, createNote, deleteBookmark }
}

describe('<TwitterView />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    for (const mock of Object.values(stateMocks)) mock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('muestra estado desconectado cuando X no está conectado', () => {
    setTwitterMocks({ connected: false, items: [] })

    renderWithProviders(<TwitterView />)

    expect(screen.getByText('X no está conectado')).toBeInTheDocument()
    expect(screen.getByText(/Configuración → X/i)).toBeInTheDocument()
  })

  it('usa el loading editorial al cargar estado o bookmarks', () => {
    setTwitterMocks()
    stateMocks.status.mockReturnValue({ isLoading: true, data: undefined })

    renderWithProviders(<TwitterView />)

    expect(screen.getByText('cargando…').closest('[role="status"]')).toBe(
      screen.getByRole('status'),
    )
  })

  it('renderiza bookmarks y permite filtrar por autor, tema, año y búsqueda', async () => {
    const user = userEvent.setup()
    setTwitterMocks()

    renderWithProviders(<TwitterView />)

    expect(screen.getByText(/Un hilo sobre memoria/i)).toBeInTheDocument()
    expect(screen.getByText(/Notas sobre música generativa/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Autores/i }))
    await user.click(screen.getByRole('button', { name: /@alice/i }))
    expect(screen.getByText(/Un hilo sobre memoria/i)).toBeInTheDocument()
    expect(screen.queryByText(/Notas sobre música generativa/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /✕ quitar filtro/i }))
    await user.click(screen.getByRole('button', { name: /^memoria/i }))
    expect(screen.getByText(/Un hilo sobre memoria/i)).toBeInTheDocument()
    expect(screen.queryByText(/Notas sobre música generativa/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Todos los temas/i }))
    await user.click(screen.getByRole('button', { name: /^2025/i }))
    expect(screen.queryByText(/Un hilo sobre memoria/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Notas sobre música generativa/i)).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox'), 'no coincide')
    expect(screen.getByText(/Ningún bookmark coincide/i)).toBeInTheDocument()
  })

  it('ejecuta sync, clasificar, crónica, extracción, nota y borrado', async () => {
    const user = userEvent.setup()
    const onProposal = vi.fn()
    const classify = vi.fn().mockResolvedValue({ classified: 2, remaining: true })
    const generate = vi.fn().mockResolvedValue({})
    const extract = vi
      .fn()
      .mockResolvedValue({ entities: [] } as unknown as ExtractionProposal)
    const createNote = vi.fn().mockResolvedValue({})
    const deleteBookmark = vi.fn()
    setTwitterMocks({ classify, generate, extract, createNote, deleteBookmark })
    vi.spyOn(api, 'xSync').mockResolvedValue({ fetched: 2, inserted: 1, classified: 1 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderWithProviders(<TwitterView onProposal={onProposal} />)

    await user.click(screen.getByRole('button', { name: /^Sincronizar$/i }))
    expect(await screen.findByText(/1 bookmarks nuevos/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Clasificar temas/i }))
    expect(await screen.findByText(/Clasificados 2/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Generar$/i }))
    await waitFor(() => expect(generate).toHaveBeenCalledOnce())

    await user.click(screen.getAllByRole('button', { name: /\+ extraer/i })[0]!)
    await waitFor(() => expect(extract).toHaveBeenCalledOnce())
    expect(onProposal).toHaveBeenCalledWith('@alice', { entities: [] })

    await user.click(screen.getAllByRole('button', { name: /\+ nota/i })[0]!)
    await waitFor(() => expect(createNote).toHaveBeenCalledOnce())

    await user.click(screen.getAllByRole('button', { name: /Quitar bookmark/i })[0]!)
    expect(window.confirm).toHaveBeenCalled()
    expect(deleteBookmark).toHaveBeenCalledWith('b1')
  })
})
