import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PdfPreviewModal } from './PdfPreviewModal'

/**
 * Smoke tests para PdfPreviewModal tras adoptar useModalOverlay.
 *
 * Foco: contrato de modal accesible (role=dialog + aria-modal) y los
 * caminos de cierre observables que el modal ya tenía antes de la
 * migración (Escape en document, click en backdrop, botón cerrar).
 *
 * El render real del PDF (pdf.js) se mockea: el modal monta siempre
 * abierto (el padre lo monta/desmonta), así que solo nos interesa el
 * cascarón del diálogo, no las páginas. `openPdfPreview` devuelve un
 * preview mínimo de 0 páginas para que el effect no haga trabajo real.
 */

const disposeMock = vi.fn()

vi.mock('../../../../lib/pdfStudio/render/pdfRender', () => ({
  openPdfPreview: vi.fn(async () => ({
    numPages: 0,
    renderPage: vi.fn(async () => 'blob:fake'),
    dispose: disposeMock,
  })),
}))

function renderModal(overrides: Partial<Parameters<typeof PdfPreviewModal>[0]> = {}) {
  const onClose = vi.fn()
  const onDownload = vi.fn()
  const onPrint = vi.fn()
  render(
    <PdfPreviewModal
      blob={new Blob(['%PDF-1.4'], { type: 'application/pdf' })}
      onClose={onClose}
      onDownload={onDownload}
      onPrint={onPrint}
      {...overrides}
    />,
  )
  return { onClose, onDownload, onPrint }
}

describe('<PdfPreviewModal />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with role="dialog" + aria-modal', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Vista previa del PDF ensamblado')
  })

  it('cierra con Escape (keydown en document)', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('no cierra con otras teclas en document', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(document, { key: 'a' })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cierra al hacer click en el backdrop', () => {
    const { onClose } = renderModal()
    // El backdrop es el contenedor EXTERNO (onClick=onClose); el panel interior
    // —el que lleva role=dialog + dialogRef— frena la propagación. Clic en el
    // backdrop (padre del dialog) cierra.
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('cierra con el botón "Cerrar vista previa"', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar vista previa' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('despacha imprimir y descargar con el blob', () => {
    const { onPrint, onDownload } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /imprimir/i }))
    fireEvent.click(screen.getByRole('button', { name: /descargar/i }))
    expect(onPrint).toHaveBeenCalledOnce()
    expect(onDownload).toHaveBeenCalledOnce()
    expect(onPrint.mock.calls[0]![0]).toBeInstanceOf(Blob)
    expect(onDownload.mock.calls[0]![0]).toBeInstanceOf(Blob)
  })
})
