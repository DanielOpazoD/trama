import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PdfTemplateFillHeader } from './PdfTemplateFillHeader'

describe('<PdfTemplateFillHeader />', () => {
  it('presenta una cabecera dedicada a rellenar e imprimir', async () => {
    const user = userEvent.setup()
    const onPrint = vi.fn()
    const onSaveCopy = vi.fn()
    const onClose = vi.fn()

    render(
      <PdfTemplateFillHeader
        currentPage={0}
        completedFields={2}
        totalFields={3}
        totalPages={4}
        zoom={100}
        onClose={onClose}
        onNextPage={vi.fn()}
        onPrevPage={vi.fn()}
        onPrepareZoomAnchor={vi.fn()}
        onPrint={onPrint}
        onSaveCopy={onSaveCopy}
        onZoomChange={vi.fn()}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
      />,
    )

    expect(screen.getByRole('banner', { name: /Rellenar planilla/i })).toHaveTextContent(
      '2/3 datos',
    )
    expect(screen.queryByRole('button', { name: /Deshacer/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Listo/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Guardar copia con datos/i }))
    await user.click(screen.getByRole('button', { name: /Imprimir planilla/i }))
    await user.click(screen.getByRole('button', { name: /Cerrar/i }))

    expect(onSaveCopy).toHaveBeenCalledTimes(1)
    expect(onPrint).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
