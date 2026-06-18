import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Recorte } from '../../api'
import { RecorteMediaPreview } from './RecorteMediaPreview'

vi.mock('../momentos/AuthenticatedMedia', () => ({
  useAuthenticatedMediaState: () => ({ src: 'blob:video', status: 'ready' }),
}))

function makeRecorte(overrides: Partial<Recorte> = {}): Recorte {
  return {
    id: 'r1',
    text: 'recorte',
    sourceUrl: null,
    sourceTitle: null,
    sourceAuthor: null,
    note: null,
    imageUrl: null,
    imageKey: null,
    images: [],
    captureMode: null,
    status: 'pending',
    promotedTarget: null,
    promotedId: null,
    captureSource: null,
    capturedAt: null,
    createdAt: '2026-06-10T12:00:00.000Z',
    updatedAt: '2026-06-10T12:00:00.000Z',
    ...overrides,
  }
}

describe('<RecorteMediaPreview />', () => {
  it('no monta marco cuando el recorte no tiene media ni miniatura derivada', () => {
    const { container } = render(
      <RecorteMediaPreview recorte={makeRecorte()} host={null} size="mediana" />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renderiza video interno cuando el blob autenticado está listo', () => {
    render(
      <RecorteMediaPreview
        recorte={makeRecorte({ imageKey: 'u/video.mp4', captureMode: 'video' })}
        host="example.com"
        size="mediana"
      />,
    )

    expect(screen.getByLabelText('Video del recorte')).toHaveAttribute(
      'src',
      'blob:video',
    )
  })

  it('mantiene contexto cuando falla una miniatura derivada', () => {
    const { container } = render(
      <RecorteMediaPreview
        recorte={makeRecorte({
          sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        })}
        host="youtube.com"
        size="mediana"
      />,
    )

    const image = container.querySelector('img')
    expect(image).not.toBeNull()
    fireEvent.error(image!)

    expect(screen.getByText('youtube.com')).toBeInTheDocument()
    expect(screen.getByText('10 jun 2026')).toBeInTheDocument()
  })
})
