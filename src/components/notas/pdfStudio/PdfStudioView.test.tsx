import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test-utils'

// Los bordes browser-only (pdf.js / pdf-lib / descarga) se mockean: no corren en
// happy-dom. El modelo puro se testea aparte en `pdfStudio/model.test.ts`.
const mocks = vi.hoisted(() => ({
  getPdfPageCount: vi.fn(),
  renderPageThumb: vi.fn(),
  forgetThumb: vi.fn(),
  disposePdfStudio: vi.fn(),
  assemble: vi.fn(),
  downloadBlob: vi.fn(),
}))
vi.mock('../../../lib/pdfStudio/pdfRender', () => ({
  getPdfPageCount: mocks.getPdfPageCount,
  renderPageThumb: mocks.renderPageThumb,
  forgetThumb: mocks.forgetThumb,
  disposePdfStudio: mocks.disposePdfStudio,
}))
vi.mock('../../../lib/pdfStudio/assemble', () => ({ assemble: mocks.assemble }))
vi.mock('../../../lib/downloadBlob', () => ({ downloadBlob: mocks.downloadBlob }))

import { PdfStudioView } from './PdfStudioView'

const pdfFile = (name = 'doc.pdf') =>
  new File(['%PDF-1.4'], name, { type: 'application/pdf' })

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getPdfPageCount.mockResolvedValue(2)
  mocks.renderPageThumb.mockResolvedValue('blob:thumb')
  mocks.assemble.mockResolvedValue({
    blob: new Blob(['pdf'], { type: 'application/pdf' }),
    skipped: [],
  })
})

describe('<PdfStudioView />', () => {
  it('muestra el estado vacío con Guardar deshabilitado', () => {
    renderWithProviders(<PdfStudioView />)
    expect(screen.getByText(/Arrastra PDFs o imágenes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar PDF/i })).toBeDisabled()
  })

  it('importa un PDF como páginas, borra y guarda', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)

    await user.upload(fileInput(), pdfFile())

    // numPages=2 → dos miniaturas.
    expect(await screen.findByAltText('Página 1')).toBeInTheDocument()
    expect(screen.getByAltText('Página 2')).toBeInTheDocument()
    expect(screen.getByText(/2 páginas/)).toBeInTheDocument()
    expect(mocks.getPdfPageCount).toHaveBeenCalledTimes(1)

    // Borrar la primera (acción en el menú ⋯) → queda una.
    await user.click(screen.getByRole('button', { name: /Acciones de la página 1/i }))
    await user.click(await screen.findByRole('menuitem', { name: /Eliminar página/i }))
    expect(screen.queryByAltText('Página 2')).not.toBeInTheDocument()
    expect(screen.getByText(/1 página/)).toBeInTheDocument()
    expect(mocks.forgetThumb).toHaveBeenCalled()

    // Guardar → ensambla + descarga.
    await user.click(screen.getByRole('button', { name: /Guardar PDF/i }))
    expect(mocks.assemble).toHaveBeenCalledTimes(1)
    expect(mocks.downloadBlob).toHaveBeenCalledTimes(1)
  })

  it('undo y redo revierten y reaplican la importación', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')
    expect(screen.getByText(/2 páginas/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Deshacer/i }))
    expect(screen.getByText(/Arrastra PDFs o imágenes/)).toBeInTheDocument()
    expect(screen.queryByAltText('Página 1')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Rehacer/i }))
    expect(await screen.findByAltText('Página 1')).toBeInTheDocument()
    expect(screen.getByText(/2 páginas/)).toBeInTheDocument()
  })

  it('rota una página sin romper la grilla', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    await user.click(screen.getByRole('button', { name: /Acciones de la página 1/i }))
    await user.click(await screen.findByRole('menuitem', { name: /Rotar a la derecha/i }))
    // La página sigue ahí y ahora hay historial para deshacer la rotación.
    expect(screen.getByAltText('Página 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Deshacer/i })).toBeEnabled()
  })

  it('agrega texto a una página y la deja marcada', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    // Abrir el editor de texto desde el menú ⋯ de la primera página.
    await user.click(screen.getByRole('button', { name: /Acciones de la página 1/i }))
    await user.click(await screen.findByRole('menuitem', { name: /Agregar texto/i }))
    expect(
      await screen.findByRole('dialog', { name: /Texto sobre la página 1/i }),
    ).toBeInTheDocument()

    // Agregar un texto y editarlo.
    await user.click(screen.getByRole('button', { name: /Agregar texto/i }))
    const ta = screen.getByPlaceholderText(/Escribe el texto/i)
    await user.clear(ta)
    await user.type(ta, 'Firmado')

    // Confirmar → el modal cierra y la página queda marcada con texto.
    await user.click(screen.getByRole('button', { name: /^Listo$/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTitle('Tiene texto')).toBeInTheDocument()
  })

  it('no agrega páginas si el archivo no se puede leer', async () => {
    mocks.getPdfPageCount.mockRejectedValueOnce(new Error('cifrado'))
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)

    await user.upload(fileInput(), pdfFile('roto.pdf'))

    // Esperamos a que termine el import (el botón vuelve de "Agregando…").
    await screen.findByRole('button', { name: /Agregar PDF o imagen/i })
    expect(mocks.getPdfPageCount).toHaveBeenCalledTimes(1)
    // No se agregó ninguna página: sigue el estado vacío y Guardar deshabilitado.
    expect(screen.getByText(/Arrastra PDFs o imágenes/)).toBeInTheDocument()
    expect(screen.queryByAltText('Página 1')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar PDF/i })).toBeDisabled()
  })
})
