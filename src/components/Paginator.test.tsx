import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Paginator } from './Paginator'

describe('<Paginator />', () => {
  it('shows "más atrás ↓" when hasNext=true and not loading', () => {
    render(<Paginator hasNext loading={false} onLoadMore={() => {}} />)
    expect(screen.getByRole('button', { name: /más atrás/i })).toBeInTheDocument()
  })

  it('shows "cargando más…" when loading=true', () => {
    render(<Paginator hasNext loading onLoadMore={() => {}} />)
    expect(screen.getByText(/cargando más…/i)).toBeInTheDocument()
  })

  it('calls onLoadMore when "más atrás" is clicked', () => {
    const onLoadMore = vi.fn()
    render(<Paginator hasNext loading={false} onLoadMore={onLoadMore} />)
    fireEvent.click(screen.getByRole('button', { name: /más atrás/i }))
    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it('disables the load-more button while loading', () => {
    render(<Paginator hasNext loading onLoadMore={() => {}} />)
    expect(screen.getByRole('button', { name: /cargando más/i })).toBeDisabled()
  })

  it('shows end-mark when no more pages + showEndMark=true (default)', () => {
    const { container } = render(
      <Paginator hasNext={false} loading={false} onLoadMore={() => {}} />,
    )
    // End-mark uses EndMark icon (svg). At least no "más atrás" button visible.
    expect(screen.queryByRole('button', { name: /más atrás/i })).not.toBeInTheDocument()
    // There should still be SOMETHING rendered (ornament + end-mark)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders nothing when no more pages + showEndMark=false', () => {
    const { container } = render(
      <Paginator
        hasNext={false}
        loading={false}
        showEndMark={false}
        onLoadMore={() => {}}
      />,
    )
    expect(container.textContent?.trim() ?? '').toBe('')
  })
})
