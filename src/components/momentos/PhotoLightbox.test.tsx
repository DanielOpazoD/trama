import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PhotoLightbox } from './PhotoLightbox'

const photos = [{ storageKey: 'user/a.jpg' }, { storageKey: 'user/b.jpg' }]

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(
      async () => new Response(new Blob(['media'], { type: 'image/jpeg' })),
    ),
  )
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:lightbox'),
      revokeObjectURL: vi.fn(),
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<PhotoLightbox />', () => {
  it('no renderiza nada cuando open=false', () => {
    const { container } = render(
      <PhotoLightbox photos={photos} open={false} onClose={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra el contador con varias fotos', () => {
    render(<PhotoLightbox photos={photos} open onClose={() => {}} />)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('avanza a la siguiente foto con la flecha', () => {
    render(<PhotoLightbox photos={photos} open onClose={() => {}} />)
    fireEvent.click(screen.getByLabelText('Foto siguiente'))
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('cierra con Escape y con clic en el fondo', () => {
    const onClose = vi.fn()
    render(<PhotoLightbox photos={photos} open onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByLabelText('Cerrar visor'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
