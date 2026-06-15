import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CaptureItem, Note, Recorte } from '../../api'
import { CapturasGalleryGrid } from './CapturasGalleryGrid'

function recorte(over: Partial<Recorte> = {}): Recorte {
  return {
    id: 'r',
    text: 'captura',
    sourceUrl: null,
    sourceTitle: null,
    sourceAuthor: null,
    note: null,
    imageUrl: null,
    imageKey: null,
    captureMode: 'image',
    status: 'pending',
    promotedTarget: null,
    promotedId: null,
    captureSource: null,
    capturedAt: '2026-06-14T12:00:00.000Z',
    createdAt: '2026-06-14T12:00:00.000Z',
    updatedAt: '2026-06-14T12:00:00.000Z',
    ...over,
  }
}

function note(): Note {
  return {
    id: 'n1',
    content: 'una nota',
    title: null,
    tags: [],
    pinned: false,
    promotedMomentoId: null,
    origin: { kind: 'manual' },
    createdAt: '2026-06-14T12:00:00.000Z',
    updatedAt: '2026-06-14T12:00:00.000Z',
  } as unknown as Note
}

// Imágenes externas (imageUrl) → useAuthenticatedMediaState no fetchea.
const items: CaptureItem[] = [
  { type: 'note', id: 'n1', createdAt: '2026-06-14T12:00:00.000Z', note: note() },
  {
    type: 'recorte',
    id: 'txt',
    createdAt: '2026-06-14T12:00:00.000Z',
    recorte: recorte({ id: 'txt', captureMode: 'citation', text: 'solo texto' }),
  },
  {
    type: 'recorte',
    id: 'img1',
    createdAt: '2026-06-14T12:00:00.000Z',
    recorte: recorte({
      id: 'img1',
      imageUrl: 'https://x/1.jpg',
      sourceTitle: 'Foto uno',
    }),
  },
  {
    type: 'recorte',
    id: 'img2',
    createdAt: '2026-06-14T12:00:00.000Z',
    recorte: recorte({
      id: 'img2',
      imageUrl: 'https://x/2.jpg',
      sourceTitle: 'Foto dos',
    }),
  },
]

describe('<CapturasGalleryGrid />', () => {
  const noop = () => {}

  it('muestra solo las capturas con imagen (excluye notas y texto)', () => {
    render(
      <CapturasGalleryGrid
        items={items}
        size="mediana"
        hasNextPage={false}
        isFetchingNextPage={false}
        onLoadMore={noop}
      />,
    )
    const cells = screen.getAllByRole('button', { name: /^ampliar/i })
    expect(cells).toHaveLength(2)
    expect(screen.queryByText('una nota')).not.toBeInTheDocument()
  })

  it('estado vacío cuando no hay imágenes', () => {
    render(
      <CapturasGalleryGrid
        items={[items[0]!]}
        size="mediana"
        hasNextPage={false}
        isFetchingNextPage={false}
        onLoadMore={noop}
      />,
    )
    expect(screen.getByText(/sin imágenes/i)).toBeInTheDocument()
  })

  it('clic en una celda abre el visor', async () => {
    render(
      <CapturasGalleryGrid
        items={items}
        size="mediana"
        hasNextPage={false}
        isFetchingNextPage={false}
        onLoadMore={noop}
      />,
    )
    expect(
      screen.queryByRole('dialog', { name: /visor de imagen/i }),
    ).not.toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: /^ampliar/i })[0]!)
    expect(screen.getByRole('dialog', { name: /visor de imagen/i })).toBeInTheDocument()
  })

  it('muestra «cargar más» cuando hay más páginas y lo invoca', async () => {
    const onLoadMore = vi.fn()
    render(
      <CapturasGalleryGrid
        items={items}
        size="mediana"
        hasNextPage
        isFetchingNextPage={false}
        onLoadMore={onLoadMore}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /cargar más/i }))
    expect(onLoadMore).toHaveBeenCalled()
  })
})
