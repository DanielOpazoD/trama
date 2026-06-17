import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmDestroy } from './ConfirmDestroy'

describe('<ConfirmDestroy />', () => {
  it('does not render when open=false', () => {
    render(
      <ConfirmDestroy
        open={false}
        title="¿Eliminar?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('renders with role="alertdialog" + title + body', () => {
    render(
      <ConfirmDestroy
        open
        title="¿Eliminar esta cita?"
        body="No se puede deshacer fácilmente."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('¿Eliminar esta cita?')).toBeInTheDocument()
    expect(screen.getByText(/No se puede deshacer/)).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDestroy
        open
        title="x"
        confirmLabel="Eliminar"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(<ConfirmDestroy open title="x" onConfirm={() => {}} onCancel={onCancel} />)
    // Hay 2 botones con aria-label "cancelar": el backdrop invisible y el
    // botón footer. Queremos el footer (texto visible "cancelar").
    const buttons = screen.getAllByRole('button', { name: /cancelar/i })
    const footerCancel = buttons.find((b) => b.textContent?.trim() === 'cancelar')
    fireEvent.click(footerCancel!)
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel when ESC is pressed', () => {
    const onCancel = vi.fn()
    render(<ConfirmDestroy open title="x" onConfirm={() => {}} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('does not close with ESC while pending=true', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmDestroy open title="x" pending onConfirm={() => {}} onCancel={onCancel} />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('disables buttons while pending=true and shows "eliminando…"', () => {
    render(
      <ConfirmDestroy open title="x" pending onConfirm={() => {}} onCancel={() => {}} />,
    )
    const cancelButtons = screen.getAllByRole('button', { name: /cancelar/i })
    const footerCancel = cancelButtons.find((b) => b.textContent?.trim() === 'cancelar')
    const confirm = screen.getByRole('button', { name: /eliminando…/i })
    expect(footerCancel).toBeDisabled()
    expect(confirm).toBeDisabled()
  })
})
