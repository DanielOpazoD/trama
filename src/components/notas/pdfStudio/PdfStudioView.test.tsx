import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
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
  printPdfBlob: vi.fn(),
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
}))
vi.mock('../../../lib/pdfStudio/pdfRender', () => ({
  getPdfPageCount: mocks.getPdfPageCount,
  renderPageThumb: mocks.renderPageThumb,
  forgetThumb: mocks.forgetThumb,
  disposePdfStudio: mocks.disposePdfStudio,
}))
vi.mock('../../../lib/pdfStudio/assemble', () => ({ assemble: mocks.assemble }))
vi.mock('../../../lib/pdfStudio/printPdf', () => ({ printPdfBlob: mocks.printPdfBlob }))
vi.mock('../../../lib/downloadBlob', () => ({ downloadBlob: mocks.downloadBlob }))
vi.mock('../../../lib/pdfStudio/persistence', () => ({
  loadDraft: mocks.loadDraft,
  saveDraft: mocks.saveDraft,
  clearDraft: mocks.clearDraft,
}))

import { PdfStudioView } from './PdfStudioView'
import { addPdfSource, emptyDoc } from '../../../lib/pdfStudio/model'

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
  mocks.loadDraft.mockResolvedValue(null) // sin borrador por defecto
  mocks.saveDraft.mockResolvedValue(undefined)
  mocks.clearDraft.mockResolvedValue(undefined)
})

describe('<PdfStudioView />', () => {
  it('muestra el estado vacío con Guardar deshabilitado', () => {
    renderWithProviders(<PdfStudioView />)
    expect(screen.getByText(/Arrastra PDFs o imágenes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar PDF/i })).toBeDisabled()
  })

  it('restaura el borrador autoguardado al montar', async () => {
    mocks.loadDraft.mockResolvedValue(addPdfSource(emptyDoc(), pdfFile(), 2))
    renderWithProviders(<PdfStudioView />)
    // Sin subir nada, las páginas del borrador aparecen.
    expect(await screen.findByAltText('Página 1')).toBeInTheDocument()
    expect(screen.getByText(/2 páginas/)).toBeInTheDocument()
    expect(mocks.loadDraft).toHaveBeenCalled()
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

    // Agregar un texto (la edición del contenido es INLINE sobre el cuadro, que
    // necesita el fondo renderizado y no corre en happy-dom; acá basta con que la
    // anotación se cree y se confirme).
    await user.click(screen.getByRole('button', { name: /Agregar texto/i }))

    // Confirmar → el modal cierra y la página queda marcada con texto.
    await user.click(screen.getByRole('button', { name: /^Listo$/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTitle('Tiene texto')).toBeInTheDocument()
  })

  it('duplicar deja dos textos en la página', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    await user.click(screen.getByRole('button', { name: /Acciones de la página 1/i }))
    await user.click(await screen.findByRole('menuitem', { name: /Agregar texto/i }))
    await screen.findByRole('dialog', { name: /Texto sobre la página 1/i })
    await user.click(screen.getByRole('button', { name: /Agregar texto/i }))
    await user.click(screen.getByRole('button', { name: /Duplicar texto/i }))
    await user.click(screen.getByRole('button', { name: /^Listo$/ }))

    // El badge "Tiene texto" muestra el conteo (2).
    expect(screen.getByTitle('Tiene texto')).toHaveTextContent('2')
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

  it('selecciona varias páginas y las elimina en lote', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')
    expect(screen.getByText(/2 páginas/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Seleccionar página 1/i }))
    await user.click(screen.getByRole('button', { name: /Seleccionar página 2/i }))

    // Aparece la barra de lote con el conteo.
    expect(
      screen.getByRole('toolbar', { name: /páginas seleccionadas/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/2 seleccionadas/)).toBeInTheDocument()

    // Eliminar en lote → documento vacío.
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(screen.getByText(/Arrastra PDFs o imágenes/)).toBeInTheDocument()
    expect(screen.queryByAltText('Página 1')).not.toBeInTheDocument()
  })

  it('duplica una página seleccionada en lote (2 → 3)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    await user.click(screen.getByRole('button', { name: /Seleccionar página 1/i }))
    await user.click(screen.getByRole('button', { name: 'Duplicar' }))
    expect(screen.getByText(/3 páginas/)).toBeInTheDocument()
  })

  it('extrae las páginas seleccionadas a un PDF nuevo (ensambla + descarga)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    await user.click(screen.getByRole('button', { name: /Seleccionar página 1/i }))
    await user.click(screen.getByRole('button', { name: 'Extraer' }))
    expect(mocks.assemble).toHaveBeenCalledTimes(1)
    expect(mocks.downloadBlob).toHaveBeenCalledTimes(1)
  })

  it('imprime una página desde el menú ⋯ (ensambla + imprime, sin descargar)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    await user.click(screen.getByRole('button', { name: /Acciones de la página 1/i }))
    await user.click(await screen.findByRole('menuitem', { name: /Imprimir página/i }))
    expect(mocks.assemble).toHaveBeenCalledTimes(1)
    expect(mocks.printPdfBlob).toHaveBeenCalledTimes(1)
    expect(mocks.downloadBlob).not.toHaveBeenCalled()
  })

  it('imprime todo el documento desde la barra superior', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    await user.click(screen.getByRole('button', { name: /^Imprimir$/i }))
    expect(mocks.assemble).toHaveBeenCalledTimes(1)
    expect(mocks.printPdfBlob).toHaveBeenCalledTimes(1)
  })

  it('imprime las páginas seleccionadas desde la barra de lote', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    await user.click(screen.getByRole('button', { name: /Seleccionar página 1/i }))
    const bar = screen.getByRole('toolbar', { name: /páginas seleccionadas/i })
    await user.click(within(bar).getByRole('button', { name: 'Imprimir' }))
    expect(mocks.assemble).toHaveBeenCalledTimes(1)
    expect(mocks.printPdfBlob).toHaveBeenCalledTimes(1)
  })

  it('doble clic en la miniatura abre el modal de ver/editar', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    const thumb = await screen.findByAltText('Página 1')

    await user.dblClick(thumb)
    expect(
      await screen.findByRole('dialog', { name: /Texto sobre la página 1/i }),
    ).toBeInTheDocument()
  })

  it('la barra del editor muestra las herramientas de estilo sin texto seleccionado (sin hint)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await user.dblClick(await screen.findByAltText('Página 1'))
    await screen.findByRole('dialog', { name: /Texto sobre la página 1/i })

    // Sin agregar ni seleccionar texto, las herramientas de estilo ya están activas…
    expect(screen.getByRole('button', { name: 'Negrita' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Color Tinta/i })).toBeInTheDocument()
    // …y NO está el viejo texto instructivo.
    expect(screen.queryByText(/toca uno para editarlo/i)).not.toBeInTheDocument()
  })

  it('navega entre páginas del documento desde el mismo visor', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile()) // getPdfPageCount mock = 2 → 2 páginas
    await screen.findByAltText('Página 1')

    await user.dblClick(screen.getByAltText('Página 1'))
    const dialog = await screen.findByRole('dialog', { name: /Texto sobre la página 1/i })

    // En la primera: "anterior" deshabilitada, "siguiente" habilitada.
    expect(
      within(dialog).getByRole('button', { name: /Página anterior/i }),
    ).toBeDisabled()
    const next = within(dialog).getByRole('button', { name: /Página siguiente/i })
    expect(next).toBeEnabled()

    // Avanza → ahora el diálogo es la página 2.
    await user.click(next)
    expect(
      screen.getByRole('dialog', { name: /Texto sobre la página 2/i }),
    ).toBeInTheDocument()
  })
})
