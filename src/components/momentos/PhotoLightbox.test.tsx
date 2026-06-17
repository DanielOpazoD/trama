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
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByLabelText('Cerrar visor'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('monta el visor fuera de contenedores transformados', () => {
    render(
      <div style={{ transform: 'translateY(0)' }}>
        <PhotoLightbox photos={photos} open onClose={() => {}} />
      </div>,
    )

    expect(screen.getByRole('dialog', { name: /visor de fotos/i }).parentElement).toBe(
      document.body,
    )
  })

  it('bloquea el scroll del fondo mientras está abierto y lo restaura al cerrar', () => {
    document.body.style.overflow = 'auto'

    const { rerender, unmount } = render(
      <PhotoLightbox photos={photos} open onClose={() => {}} />,
    )

    expect(document.body.style.overflow).toBe('hidden')

    rerender(<PhotoLightbox photos={photos} open={false} onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('auto')

    rerender(<PhotoLightbox photos={photos} open onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('auto')
  })
})
