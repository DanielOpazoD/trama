import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LinkMediaPreview } from './LinkMediaPreview'

describe('<LinkMediaPreview />', () => {
  it('acota el ancho del marco según el tamaño elegido', () => {
    const { rerender } = render(<LinkMediaPreview imageUrl="/x.png" size="pequena" />)
    expect(screen.getByTestId('link-media-image').parentElement).toHaveClass(
      'max-w-[150px]',
    )
    rerender(<LinkMediaPreview imageUrl="/x.png" size="mediana" />)
    expect(screen.getByTestId('link-media-image').parentElement).toHaveClass(
      'max-w-[260px]',
    )
    // 'grande' no acota (ancho completo, comportamiento histórico).
    rerender(<LinkMediaPreview imageUrl="/x.png" size="grande" />)
    const frame = screen.getByTestId('link-media-image').parentElement!
    expect(frame.className).not.toContain('max-w-[')
  })

  it('imagen propia (sin href) abre el visor con doble clic y con teclado', async () => {
    const onOpenImage = vi.fn()
    render(<LinkMediaPreview imageUrl="/x.png" onOpenImage={onOpenImage} />)
    const frame = screen.getByRole('button', { name: /ampliar imagen/i })

    await userEvent.dblClick(frame)
    expect(onOpenImage).toHaveBeenCalledTimes(1)

    frame.focus()
    await userEvent.keyboard('{Enter}')
    expect(onOpenImage).toHaveBeenCalledTimes(2)
  })

  it('un solo clic NO abre el visor (solo doble clic)', async () => {
    const onOpenImage = vi.fn()
    render(<LinkMediaPreview imageUrl="/x.png" onOpenImage={onOpenImage} />)
    await userEvent.click(screen.getByRole('button', { name: /ampliar imagen/i }))
    expect(onOpenImage).not.toHaveBeenCalled()
  })

  it('con href, es un enlace y NO usa el visor (gana el original)', () => {
    const onOpenImage = vi.fn()
    render(
      <LinkMediaPreview
        imageUrl="/x.png"
        href="https://example.com"
        onOpenImage={onOpenImage}
      />,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
