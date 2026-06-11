import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entity, Momento } from '../../types'
import { AlbumGrid } from './AlbumGrid'

vi.mock('./MomentoEditModal', () => ({
  MomentoEditModal: ({
    open,
    onClose,
  }: {
    momento: Momento
    open: boolean
    onClose: () => void
  }) =>
    open ? (
      <div role="dialog" aria-label="Editar foto">
        <button type="button" onClick={onClose}>
          cerrar
        </button>
      </div>
    ) : null,
}))

vi.mock('./MomentoFeedback', () => ({
  MomentoFeedback: ({ momentoId }: { momentoId: string }) => (
    <div data-testid={`album-feedback-${momentoId}`} />
  ),
}))

const entity = {
  id: 'e1',
  name: 'Valparaíso',
  type: 'lugar',
} as Entity

const photoMomento = {
  id: 'foto-1',
  kind: 'foto',
  capturedAt: '2026-05-12T10:00:00Z',
  note: null,
  entityIds: ['e1'],
  links: [],
  origin: { kind: 'manual' },
  createdAt: '2026-05-12T10:00:00Z',
  updatedAt: '2026-05-12T10:00:00Z',
  payload: {
    caption: 'Puerto al atardecer',
    items: [
      { storageKey: 'puerto uno.jpg', width: 800, height: 600 },
      { storageKey: 'puerto dos.jpg', width: 800, height: 600 },
    ],
  },
} as unknown as Momento

const noteMomento = {
  ...photoMomento,
  id: 'nota-1',
  kind: 'nota',
  payload: { bodyText: 'no soy foto' },
} as unknown as Momento

const legacyPhotoMomento = {
  ...photoMomento,
  id: 'foto-legacy',
  payload: {
    caption: 'Foto migrada',
    photos: [
      { storageKey: 'legada uno.jpg', width: 800, height: 600 },
      { storageKey: 'legada dos.jpg', width: 800, height: 600 },
    ],
    primaryStorageKey: 'legada uno.jpg',
  },
} as unknown as Momento

describe('<AlbumGrid />', () => {
  beforeEach(() => {
    window.localStorage.clear()
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
        createObjectURL: vi.fn(() => `blob:album-${++objectUrlIndex}`),
        revokeObjectURL: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra estado vacío cuando no recibe fotos', () => {
    render(
      <AlbumGrid
        items={[noteMomento]}
        entitiesById={new Map([['e1', entity]])}
        onDelete={() => {}}
      />,
    )

    expect(screen.getByText('No hay fotos todavía')).toBeInTheDocument()
  })

  it('renderiza fotos, ignora otros kinds y permite eliminar desde el menú', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()

    render(
      <AlbumGrid
        items={[noteMomento, photoMomento]}
        entitiesById={new Map([['e1', entity]])}
        onDelete={onDelete}
      />,
    )

    const image = screen.getByRole('img', { name: 'Puerto al atardecer' })
    await waitFor(() => expect(image).toHaveAttribute('src', 'blob:album-1'))
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.queryByText('no soy foto')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /opciones de foto/i }))
    await user.click(screen.getByRole('menuitem', { name: /eliminar/i }))

    expect(onDelete).toHaveBeenCalledWith('foto-1')
  })

  it('permite editar una foto desde el menú', async () => {
    const user = userEvent.setup()

    render(
      <AlbumGrid
        items={[photoMomento]}
        entitiesById={new Map([['e1', entity]])}
        onDelete={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /opciones de foto/i }))
    await user.click(screen.getByRole('menuitem', { name: /editar/i }))

    expect(screen.getByRole('dialog', { name: /editar foto/i })).toBeInTheDocument()
  })

  it('renderiza fotos persistidas con payload photos legado', async () => {
    render(
      <AlbumGrid
        items={[legacyPhotoMomento]}
        entitiesById={new Map([['e1', entity]])}
        onDelete={() => {}}
      />,
    )

    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Foto migrada' })).toHaveAttribute(
        'src',
        'blob:album-1',
      ),
    )
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('usa agrupación cronológica por defecto sin mostrar configuración de agrupar', async () => {
    render(
      <AlbumGrid
        items={[photoMomento]}
        entitiesById={new Map([['e1', entity]])}
        onDelete={() => {}}
      />,
    )

    expect(screen.queryByText('agrupar')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'mensual' })).not.toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
  })

  it('permite cambiar el tamaño desde un menú compacto y lo persiste', async () => {
    const user = userEvent.setup()

    render(
      <AlbumGrid
        items={[photoMomento]}
        entitiesById={new Map([['e1', entity]])}
        onDelete={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /tamaño: medio/i }))
    await user.click(screen.getByRole('menuitem', { name: 'grande' }))

    expect(window.localStorage.getItem('trama:album-size')).toBe('large')
    expect(screen.getByText('Valparaíso')).toBeInTheDocument()
  })

  it('usa el hook compartido para persistir preferencias de album', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'AlbumGrid.tsx'),
      'utf8',
    )

    expect(src).toContain('useLocalStorageState')
    expect(src).not.toContain('window.localStorage')
  })
})
