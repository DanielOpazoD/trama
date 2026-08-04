import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readdirSync, readFileSync } from 'node:fs'
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
        size="medium"
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
        size="medium"
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
        size="medium"
        items={[photoMomento]}
        entitiesById={new Map([['e1', entity]])}
        onDelete={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /opciones de foto/i }))
    await user.click(screen.getByRole('menuitem', { name: /editar/i }))

    expect(screen.getByRole('dialog', { name: /editar foto/i })).toBeInTheDocument()
  })

  it('abre el visor de fotos al hacer clic en la imagen del álbum', async () => {
    const user = userEvent.setup()

    render(
      <AlbumGrid
        size="medium"
        items={[photoMomento]}
        entitiesById={new Map([['e1', entity]])}
        onDelete={() => {}}
      />,
    )

    const image = screen.getByRole('img', { name: 'Puerto al atardecer' })
    await waitFor(() => expect(image).toHaveAttribute('src', 'blob:album-1'))

    await user.click(image)

    expect(screen.getByRole('dialog', { name: /visor de fotos/i })).toBeInTheDocument()
  })

  it('la portada de video CON póster monta <img> del póster, nunca <video>', async () => {
    const videoConPoster = {
      ...photoMomento,
      id: 'video-1',
      payload: {
        caption: 'Clip del puerto',
        items: [
          {
            storageKey: 'u1/r2-clip.mp4',
            type: 'video',
            posterStorageKey: 'u1/poster.jpg',
            width: 1920,
            height: 1080,
          },
        ],
      },
    } as unknown as Momento
    const fetchMock = vi.mocked(globalThis.fetch)
    const { container } = render(
      <AlbumGrid
        items={[videoConPoster]}
        entitiesById={new Map()}
        onDelete={() => {}}
        size="medium"
      />,
    )

    await waitFor(() => {
      expect(screen.getByAltText('Clip del puerto')).toBeInTheDocument()
    })
    // El punto del póster: la tile NO monta <video> (que bajaría el clip
    // entero por la capa autenticada) y lo único pedido a la red es el póster.
    expect(container.querySelector('video')).toBeNull()
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('poster.jpg'))).toBe(true)
    expect(urls.some((u) => u.includes('r2-clip.mp4'))).toBe(false)
  })

  it('la portada de video SIN póster cae al <video> de siempre', async () => {
    const videoSinPoster = {
      ...photoMomento,
      id: 'video-2',
      payload: {
        items: [{ storageKey: 'u1/r2-viejo.mp4', type: 'video' }],
      },
    } as unknown as Momento
    const { container } = render(
      <AlbumGrid
        items={[videoSinPoster]}
        entitiesById={new Map()}
        onDelete={() => {}}
        size="medium"
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('video')).not.toBeNull()
    })
  })

  it('la tile de foto pide la MINIATURA derivada, no el original', async () => {
    const conThumb = {
      ...photoMomento,
      id: 'foto-thumb',
      payload: {
        caption: 'Con derivado',
        items: [
          {
            storageKey: 'u1/original.jpg',
            thumbStorageKey: 'u1/mini.jpg',
            width: 2000,
            height: 1500,
          },
        ],
      },
    } as unknown as Momento
    const fetchMock = vi.mocked(globalThis.fetch)
    render(
      <AlbumGrid
        items={[conThumb]}
        entitiesById={new Map()}
        onDelete={() => {}}
        size="medium"
      />,
    )

    await waitFor(() => {
      expect(screen.getByAltText('Con derivado')).toBeInTheDocument()
    })
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    // El punto del pack: la grilla pesa KBs, el original queda para el visor.
    expect(urls.some((u) => u.includes('mini.jpg'))).toBe(true)
    expect(urls.some((u) => u.includes('original.jpg'))).toBe(false)
  })

  it('renderiza fotos persistidas con payload photos legado', async () => {
    render(
      <AlbumGrid
        size="medium"
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
        size="medium"
        items={[photoMomento]}
        entitiesById={new Map([['e1', entity]])}
        onDelete={() => {}}
      />,
    )

    expect(screen.queryByText('agrupar')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'mensual' })).not.toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
  })

  /**
   * El menú de tamaño se movió a la barra (MomentosToolbar), donde viven los
   * demás controles de vista: aquí se comía una fila entera para sí solo. Su
   * comportamiento se prueba en MomentosViewSections.test.tsx; lo que AlbumGrid
   * debe garantizar ahora es que respeta el tamaño que le llega.
   */
  it('respeta el tamaño que recibe por props', () => {
    const { container } = render(
      <AlbumGrid
        size="large"
        items={[photoMomento]}
        entitiesById={new Map([['e1', entity]])}
        onDelete={() => {}}
      />,
    )

    // Cada tamaño tiene su propia maqueta: 'large' es la de una columna.
    expect(container.querySelector('.columns-1')).not.toBeNull()
    expect(container.querySelector('.grid-cols-3')).toBeNull()
    expect(screen.getByText('Valparaíso')).toBeInTheDocument()
  })

  /**
   * El invariante es «nadie del mundo Momentos habla con localStorage a mano»,
   * no «tal fichero contiene tal import»: la persistencia del tamaño ya se
   * movió dos veces (AlbumGrid → MomentosView → useAlbumTileSize) y una sonda
   * atada a una ruta se rompe en cada mudanza sin que nada esté mal.
   */
  it('nadie toca window.localStorage a mano: el hook compartido lo hace', () => {
    const aquí = dirname(fileURLToPath(import.meta.url))
    const ficheros = readdirSync(aquí)
      .filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))
      .map((f) => join(aquí, f))
      .concat(join(aquí, '..', 'MomentosView.tsx'))

    for (const fichero of ficheros) {
      expect(readFileSync(fichero, 'utf8'), fichero).not.toContain('window.localStorage')
    }

    // Y la persistencia existe de verdad, vía el hook compartido.
    const hook = readFileSync(join(aquí, 'useAlbumTileSize.ts'), 'utf8')
    expect(hook).toContain('useLocalStorageState')
  })
})
