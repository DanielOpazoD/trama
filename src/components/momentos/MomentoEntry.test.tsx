import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setApiAuthTokenProvider } from '../../api/request'
import { setCurrentClientUser } from '../../lib/clientIdentity'
import type { Entity, Momento } from '../../types'
import { MomentoEntry } from './MomentoEntry'

vi.mock('./MomentoEditModal', () => ({
  MomentoEditModal: ({
    momento,
    open,
    onClose,
  }: {
    momento: Momento
    open: boolean
    onClose: () => void
  }) =>
    open ? (
      <div role="dialog" aria-label={`Editar ${momento.kind}`}>
        <button type="button" onClick={onClose}>
          cerrar
        </button>
      </div>
    ) : null,
}))

const entity: Entity = {
  id: 'e1',
  name: 'Borges',
  type: 'escritor',
  origin: { kind: 'manual' },
  createdAt: '2026-05-20T10:00:00.000Z',
  updatedAt: '2026-05-20T10:00:00.000Z',
}

beforeEach(() => {
  let objectUrlIndex = 0
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(
      async () => new Response(new Blob(['media'], { type: 'image/jpeg' })),
    ),
  )
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:media-${++objectUrlIndex}`),
      revokeObjectURL: vi.fn(),
    }),
  )
})

afterEach(() => {
  setApiAuthTokenProvider(null)
  setCurrentClientUser({ userId: null })
  vi.unstubAllGlobals()
})

function baseMomento(kind: Momento['kind'], payload: Momento['payload']): Momento {
  return {
    id: `m-${kind}`,
    kind,
    capturedAt: '2026-05-31T14:35:00.000Z',
    payload,
    note: undefined,
    origin: { kind: 'manual' },
    entityIds: ['e1', 'missing'],
    createdAt: '2026-05-31T14:35:00.000Z',
    updatedAt: '2026-05-31T14:35:00.000Z',
  }
}

describe('<MomentoEntry />', () => {
  it('renderiza una nota con entidades vinculadas y acciones contextuales', () => {
    const onDelete = vi.fn()
    render(
      <MomentoEntry
        momento={{
          ...baseMomento('nota', { bodyText: 'Una nota con filo.' }),
          origin: { kind: 'ai', provider: 'openai', model: 'gpt' },
        }}
        entitiesById={new Map([['e1', entity]])}
        onDelete={onDelete}
      />,
    )

    expect(screen.getByText('Una nota con filo.')).toBeInTheDocument()
    expect(screen.getByText('Borges')).toBeInTheDocument()
    expect(screen.getByTitle(/origen ia/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /opciones del momento/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /editar/i }))
    expect(screen.getByRole('dialog', { name: /editar nota/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^cerrar$/i }))
    expect(screen.queryByRole('dialog', { name: /editar nota/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /opciones del momento/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /eliminar/i }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /compartir momento/i })).toBeNull()
  })

  it('muestra quién subió un momento compartido con una marca de autoría premium', () => {
    render(
      <MomentoEntry
        momento={{
          ...baseMomento('nota', { bodyText: 'La reunión del colegio.' }),
          ownerUserId: 'user-mama',
          ownerDisplayName: 'Mamá',
          ownerEmail: 'mama@example.com',
          accessRole: 'editor',
          shared: true,
        }}
        entitiesById={new Map()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('La reunión del colegio.')).toBeInTheDocument()
    expect(screen.getByLabelText(/subido por mamá/i)).toBeInTheDocument()
    expect(screen.getByText('Subido por')).toBeInTheDocument()
    expect(screen.getByText('M')).toBeInTheDocument()
    expect(screen.getByText('puede editar')).toBeInTheDocument()
  })

  it('marca los momentos propios con el nombre asociado al correo', () => {
    render(
      <MomentoEntry
        momento={{
          ...baseMomento('nota', { bodyText: 'Mi propia nota.' }),
          ownerUserId: 'user-current',
          ownerEmail: 'daniel.opazo@example.com',
          accessRole: 'owner',
          shared: false,
        }}
        entitiesById={new Map()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByLabelText(/subido por daniel opazo/i)).toBeInTheDocument()
    expect(screen.getByText('Daniel Opazo')).toBeInTheDocument()
    expect(screen.getByText('propietario')).toBeInTheDocument()
    expect(screen.queryByText('Tú')).toBeNull()
    expect(screen.queryByText('tuyo')).toBeNull()
  })

  it('prefiere el perfil Clerk actual sobre el dueño legacy en momentos propios', () => {
    setCurrentClientUser({
      userId: 'user-current',
      label: null,
      email: 'daniel.opazo@hospitalhangaroa.cl',
    })

    render(
      <MomentoEntry
        momento={{
          ...baseMomento('foto', {
            caption: 'foto propia',
            items: [{ storageKey: 'foto-propia.jpg' }],
          }),
          ownerUserId: 'legacy-single-user',
          ownerDisplayName: 'Trama (legacy)',
          accessRole: 'owner',
        }}
        entitiesById={new Map()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByLabelText(/subido por daniel opazo/i)).toBeInTheDocument()
    expect(screen.queryByText('Trama (legacy)')).toBeNull()
  })

  it('renderiza un recorte con autor, fuente, enlace, cita y nota', () => {
    render(
      <MomentoEntry
        momento={{
          ...baseMomento('recorte', {
            url: 'https://example.com/articulo',
            title: 'Un artículo',
            source: 'Revista',
            author: 'Autora',
            bodyText: 'Fragmento seleccionado',
          }),
          note: 'nota al margen',
        }}
        entitiesById={new Map()}
        onDelete={vi.fn()}
      />,
    )

    const link = screen.getByRole('link', { name: /un artículo/i })
    expect(link).toHaveAttribute('href', 'https://example.com/articulo')
    expect(screen.getByText('Autora')).toBeInTheDocument()
    expect(screen.getByText('Revista')).toBeInTheDocument()
    expect(screen.getByText('Fragmento seleccionado')).toBeInTheDocument()
    expect(screen.getByText('nota al margen')).toBeInTheDocument()
  })

  it('renderiza foto legacy o múltiple con portada, contador, caption y nota', async () => {
    render(
      <MomentoEntry
        momento={{
          ...baseMomento('foto', {
            caption: 'la mesa de trabajo',
            items: [
              { storageKey: 'foto uno.jpg', width: 800, height: 600 },
              { storageKey: 'foto-dos.jpg', width: 640, height: 480 },
            ],
          }),
          note: 'dos fotos del mismo episodio',
        }}
        entitiesById={new Map()}
        onDelete={vi.fn()}
      />,
    )

    const openButton = screen.getByRole('button', { name: /abrir visor.*2 fotos/i })
    const image = screen.getByRole('img', { name: /la mesa de trabajo/i })
    await waitFor(() => expect(image).toHaveAttribute('src', 'blob:media-1'))
    expect(openButton).toContainElement(image)
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('dos fotos del mismo episodio')).toBeInTheDocument()
  })

  it('renderiza fotos y nota de voz guardadas con el payload photos legado', async () => {
    const { container } = render(
      <MomentoEntry
        momento={{
          ...baseMomento('foto', {
            caption: 'archivo viejo',
            photos: [
              { storageKey: 'vieja uno.jpg', width: 800, height: 600 },
              { storageKey: 'vieja-dos.jpg', width: 640, height: 480 },
            ],
            primaryStorageKey: 'vieja uno.jpg',
            audioKey: 'voz vieja.mp3',
          }),
        }}
        entitiesById={new Map()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.queryByText('(imagen no encontrada)')).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /archivo viejo/i })).toHaveAttribute(
        'src',
        'blob:media-1',
      ),
    )
    expect(screen.getByText('+1')).toBeInTheDocument()
    const audio = container.querySelector('audio')
    await waitFor(() => expect(audio).toHaveAttribute('src', 'blob:media-2'))
  })

  it('renderiza fotos y notas de voz namespaced como segmentos del path', async () => {
    const { container } = render(
      <MomentoEntry
        momento={{
          ...baseMomento('foto', {
            caption: 'foto reciente',
            items: [
              {
                storageKey: 'legacy-single-user/foto-reciente.jpg',
                width: 800,
                height: 600,
              },
            ],
            audioKey: 'legacy-single-user/voz-reciente.webm',
          }),
        }}
        entitiesById={new Map()}
        onDelete={vi.fn()}
      />,
    )

    await waitFor(() =>
      expect(screen.getByRole('img', { name: /foto reciente/i })).toHaveAttribute(
        'src',
        'blob:media-1',
      ),
    )
    const audio = container.querySelector('audio')
    await waitFor(() => expect(audio).toHaveAttribute('src', 'blob:media-2'))
  })

  it('carga fotos y notas de voz por el cliente autenticado', async () => {
    setApiAuthTokenProvider(async () => 'clerk-token')
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(new Blob(['media'], { type: 'image/jpeg' })),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi
          .fn()
          .mockReturnValueOnce('blob:foto-autenticada')
          .mockReturnValueOnce('blob:audio-autenticado'),
        revokeObjectURL: vi.fn(),
      }),
    )

    const { container } = render(
      <MomentoEntry
        momento={{
          ...baseMomento('foto', {
            caption: 'foto privada',
            items: [{ storageKey: 'legacy-single-user/foto-privada.jpg' }],
            audioKey: 'legacy-single-user/voz-privada.webm',
          }),
        }}
        entitiesById={new Map()}
        onDelete={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/momentos-file/legacy-single-user/foto-privada.jpg',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer clerk-token',
          }),
        }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/momentos-file/legacy-single-user/voz-privada.webm',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer clerk-token',
          }),
        }),
      )
    })

    expect(screen.getByRole('img', { name: /foto privada/i })).toHaveAttribute(
      'src',
      'blob:foto-autenticada',
    )
    expect(container.querySelector('audio')).toHaveAttribute(
      'src',
      'blob:audio-autenticado',
    )
  })

  it('recupera fotos y notas de voz legacy si el bearer resuelve a otro userId', async () => {
    setApiAuthTokenProvider(async () => 'clerk-token')
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const authorization = new Headers(init?.headers).get('Authorization')
      if (authorization) {
        return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
      }
      return new Response(new Blob(['media'], { type: 'image/jpeg' }))
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi
          .fn()
          .mockReturnValueOnce('blob:foto-legacy')
          .mockReturnValueOnce('blob:audio-legacy'),
        revokeObjectURL: vi.fn(),
      }),
    )

    const { container } = render(
      <MomentoEntry
        momento={{
          ...baseMomento('foto', {
            caption: 'archivo legacy',
            items: [{ storageKey: 'legacy-single-user/foto-legacy.jpg' }],
            audioKey: 'legacy-single-user/voz-legacy.webm',
          }),
        }}
        entitiesById={new Map()}
        onDelete={vi.fn()}
      />,
    )

    await waitFor(() =>
      expect(screen.getByRole('img', { name: /archivo legacy/i })).toHaveAttribute(
        'src',
        'blob:foto-legacy',
      ),
    )
    await waitFor(() =>
      expect(container.querySelector('audio')).toHaveAttribute(
        'src',
        'blob:audio-legacy',
      ),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/momentos-file/legacy-single-user/foto-legacy.jpg',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.any(String),
        }),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/momentos-file/legacy-single-user/voz-legacy.webm',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.any(String),
        }),
      }),
    )
  })

  it('recupera fotos y notas de voz legacy sin namespace si el bearer resuelve a otro userId', async () => {
    setApiAuthTokenProvider(async () => 'clerk-token')
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const authorization = new Headers(init?.headers).get('Authorization')
      if (authorization) {
        return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
      }
      return new Response(new Blob(['media'], { type: 'image/jpeg' }))
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi
          .fn()
          .mockReturnValueOnce('blob:foto-simple-legacy')
          .mockReturnValueOnce('blob:audio-simple-legacy'),
        revokeObjectURL: vi.fn(),
      }),
    )

    const { container } = render(
      <MomentoEntry
        momento={{
          ...baseMomento('foto', {
            caption: 'archivo simple',
            items: [{ storageKey: 'foto-simple.jpg' }],
            audioKey: 'voz-simple.webm',
          }),
        }}
        entitiesById={new Map()}
        onDelete={vi.fn()}
      />,
    )

    await waitFor(() =>
      expect(screen.getByRole('img', { name: /archivo simple/i })).toHaveAttribute(
        'src',
        'blob:foto-simple-legacy',
      ),
    )
    await waitFor(() =>
      expect(container.querySelector('audio')).toHaveAttribute(
        'src',
        'blob:audio-simple-legacy',
      ),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/momentos-file/foto-simple.jpg',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.any(String),
        }),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/momentos-file/voz-simple.webm',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.any(String),
        }),
      }),
    )
  })
})
