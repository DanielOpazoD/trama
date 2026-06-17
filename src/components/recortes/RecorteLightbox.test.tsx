import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../momentos/AuthenticatedMedia', () => ({
  useAuthenticatedMediaState: () => ({ src: 'blob:recorte', status: 'ready' }),
}))

import { RecorteLightbox } from './RecorteLightbox'

const entries = [
  { url: '/api/recortes-image/a', caption: 'uno.jpg' },
  { url: '/api/recortes-image/b', caption: 'dos.jpg' },
]

function setup(overrides: Partial<Parameters<typeof RecorteLightbox>[0]> = {}) {
  const props = {
    entries,
    index: 0,
    onIndexChange: vi.fn(),
    open: true,
    onClose: vi.fn(),
    ...overrides,
  }
  const view = render(<RecorteLightbox {...props} />)
  return { ...props, ...view }
}

describe('<RecorteLightbox />', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.style.overflow = ''
  })

  it('ports the image viewer to document.body and locks body scroll while open', () => {
    document.body.style.overflow = 'auto'

    setup()

    expect(screen.getByRole('dialog', { name: /visor de imagen/i }).parentElement).toBe(
      document.body,
    )
    expect(screen.getByRole('img', { name: 'uno.jpg' })).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('delegates Escape close to the modal overlay and keeps arrow navigation local', () => {
    const { onClose, onIndexChange } = setup({ index: 0 })

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onIndexChange).toHaveBeenCalledWith(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('restores body scroll when the lightbox unmounts', async () => {
    document.body.style.overflow = 'auto'
    const { rerender } = setup()

    rerender(
      <RecorteLightbox
        entries={entries}
        index={0}
        onIndexChange={vi.fn()}
        open={false}
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => expect(document.body.style.overflow).toBe('auto'))
  })
})
