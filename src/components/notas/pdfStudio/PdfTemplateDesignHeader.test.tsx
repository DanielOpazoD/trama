import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PdfTemplateDesignHeader } from './PdfTemplateDesignHeader'

function renderHeader({
  fieldCount = 0,
  onApply = vi.fn(),
  onCreateField = vi.fn(),
}: {
  fieldCount?: number
  onApply?: () => void
  onCreateField?: () => void
} = {}) {
  render(
    <PdfTemplateDesignHeader
      currentPage={0}
      fieldCount={fieldCount}
      redoable={false}
      totalPages={2}
      undoable={false}
      zoom={100}
      onApply={onApply}
      onClose={vi.fn()}
      onCreateField={onCreateField}
      onNextPage={vi.fn()}
      onPrepareZoomAnchor={vi.fn()}
      onPrevPage={vi.fn()}
      onRedo={vi.fn()}
      onUndo={vi.fn()}
      onZoomChange={vi.fn()}
      onZoomIn={vi.fn()}
      onZoomOut={vi.fn()}
    />,
  )
}

describe('<PdfTemplateDesignHeader />', () => {
  it('usa crear casillero como accion primaria cuando la plantilla esta vacia', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const onCreateField = vi.fn()

    renderHeader({ onApply, onCreateField })

    expect(screen.getByRole('banner', { name: /Crear plantilla/i })).toHaveTextContent(
      '0 casilleros',
    )
    expect(
      screen.queryByRole('button', { name: /Aplicar casilleros/i }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Crear casillero/i }))

    expect(onCreateField).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('mantiene aplicar casilleros cuando ya existen campos', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const onCreateField = vi.fn()

    renderHeader({ fieldCount: 2, onApply, onCreateField })

    expect(
      screen.queryByRole('button', { name: /Crear casillero/i }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Aplicar casilleros/i }))

    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onCreateField).not.toHaveBeenCalled()
  })
})
