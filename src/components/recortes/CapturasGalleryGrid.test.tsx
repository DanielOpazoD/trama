import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CaptureItem, Note, Recorte } from '../../api'
import {
  CapturasGalleryGrid,
  chunkCapturasGalleryRows,
  getCapturasGalleryColumnCount,
} from './CapturasGalleryGrid'

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

  it('calcula columnas responsive por tamaño de miniatura', () => {
    expect(getCapturasGalleryColumnCount('pequena', 390)).toBe(3)
    expect(getCapturasGalleryColumnCount('pequena', 700)).toBe(5)
    expect(getCapturasGalleryColumnCount('pequena', 900)).toBe(6)
    expect(getCapturasGalleryColumnCount('mediana', 390)).toBe(2)
    expect(getCapturasGalleryColumnCount('mediana', 700)).toBe(3)
    expect(getCapturasGalleryColumnCount('mediana', 900)).toBe(4)
    expect(getCapturasGalleryColumnCount('grande', 390)).toBe(1)
    expect(getCapturasGalleryColumnCount('grande', 700)).toBe(2)
    expect(getCapturasGalleryColumnCount('grande', 900)).toBe(3)
  })

  it('parte la galería en filas para virtualizar sin perder orden', () => {
    expect(chunkCapturasGalleryRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

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

  it('monta solo una ventana de filas cuando hay muchas capturas', () => {
    const manyItems: CaptureItem[] = Array.from({ length: 120 }, (_, i) => ({
      type: 'recorte',
      id: `img-${i}`,
      createdAt: '2026-06-14T12:00:00.000Z',
      recorte: recorte({
        id: `img-${i}`,
        imageUrl: `https://x/${i}.jpg`,
        sourceTitle: `Foto ${i}`,
      }),
    }))

    render(
      <div id="main-scroll" style={{ height: 600, overflowY: 'auto' }}>
        <CapturasGalleryGrid
          items={manyItems}
          size="mediana"
          hasNextPage={false}
          isFetchingNextPage={false}
          onLoadMore={noop}
        />
      </div>,
    )

    expect(screen.getAllByRole('button', { name: /^ampliar/i }).length).toBeLessThan(120)
  })
})
