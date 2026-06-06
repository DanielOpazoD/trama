import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test-utils'

// Los bordes browser-only (pdf.js / pdf-lib / descarga) se mockean: no corren en
// happy-dom. El modelo puro se testea aparte en `pdfStudio/model.test.ts`.
const mocks = vi.hoisted(() => ({
  getPdfPageCount: vi.fn(),
  renderPageThumb: vi.fn(),
  renderPageBitmap: vi.fn(),
  forgetThumb: vi.fn(),
  disposePdfStudio: vi.fn(),
  assemble: vi.fn(),
  downloadBlob: vi.fn(),
  openBlankPdfTab: vi.fn(),
  showPdfInTab: vi.fn(),
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
  listSavedDocs: vi.fn(),
  putSavedDoc: vi.fn(),
  deleteSavedDoc: vi.fn(),
}))
vi.mock('../../../lib/pdfStudio/pdfRender', () => ({
  getPdfPageCount: mocks.getPdfPageCount,
  renderPageThumb: mocks.renderPageThumb,
  renderPageBitmap: mocks.renderPageBitmap,
  forgetThumb: mocks.forgetThumb,
  disposePdfStudio: mocks.disposePdfStudio,
}))
vi.mock('../../../lib/pdfStudio/assemble', () => ({ assemble: mocks.assemble }))
vi.mock('../../../lib/pdfStudio/printPdf', () => ({
  openBlankPdfTab: mocks.openBlankPdfTab,
  showPdfInTab: mocks.showPdfInTab,
}))
vi.mock('../../../lib/downloadBlob', () => ({ downloadBlob: mocks.downloadBlob }))
vi.mock('../../../lib/pdfStudio/persistence', () => ({
  loadDraft: mocks.loadDraft,
  saveDraft: mocks.saveDraft,
  clearDraft: mocks.clearDraft,
  listSavedDocs: mocks.listSavedDocs,
  putSavedDoc: mocks.putSavedDoc,
  deleteSavedDoc: mocks.deleteSavedDoc,
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
  mocks.renderPageBitmap.mockResolvedValue({ url: 'blob:bg', w: 1000, h: 1400 })
  mocks.assemble.mockResolvedValue({
    blob: new Blob(['pdf'], { type: 'application/pdf' }),
    skipped: [],
  })
  mocks.openBlankPdfTab.mockReturnValue(null) // sin pestaña real en happy-dom
  mocks.loadDraft.mockResolvedValue(null) // sin borrador por defecto
  mocks.saveDraft.mockResolvedValue(undefined)
  mocks.clearDraft.mockResolvedValue(undefined)
  mocks.listSavedDocs.mockResolvedValue([]) // sin guardados por defecto
  mocks.putSavedDoc.mockResolvedValue(undefined)
  mocks.deleteSavedDoc.mockResolvedValue(undefined)
})

describe('<PdfStudioView />', () => {
  it('muestra el estado vacío con Guardar deshabilitado', () => {
    renderWithProviders(<PdfStudioView />)
    expect(screen.getByText(/Arrastra PDFs o imágenes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar PDF/i })).toBeDisabled()
  })

  it('restaura el borrador autoguardado al montar', async () => {
    mocks.loadDraft.mockResolvedValue({
      doc: addPdfSource(emptyDoc(), pdfFile(), 2),
      library: [],
    })
    renderWithProviders(<PdfStudioView />)
    // Sin subir nada, las páginas del borrador aparecen.
    expect(await screen.findByAltText('Página 1')).toBeInTheDocument()
    expect(screen.getByText(/2 páginas/)).toBeInTheDocument()
    expect(mocks.loadDraft).toHaveBeenCalled()
  })

  it('subir una imagen la guarda en la biblioteca lateral', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    const img = new File(['x'], 'foto.png', { type: 'image/png' })
    await user.upload(fileInput(), img)
    // La imagen entra como página y además aparece el panel (con la biblioteca).
    expect(await screen.findByAltText('Página 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ocultar el panel/i })).toBeInTheDocument()
    // Y se puede agregar otra vez al documento desde la biblioteca.
    await user.click(
      screen.getByRole('button', { name: /Agregar esta imagen al documento/i }),
    )
    expect(await screen.findByAltText('Página 2')).toBeInTheDocument()
  })

  it('guarda una creación con nombre y la lista persiste', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    // Abrir el panel y guardar la creación (sección Guardados).
    await user.click(screen.getByRole('button', { name: /Mostrar el panel/i }))
    await user.click(screen.getByRole('button', { name: /^Guardar$/i }))
    const input = screen.getByPlaceholderText(/Nombre de la creación/i)
    await user.type(input, 'Mi receta{Enter}')

    expect(mocks.putSavedDoc).toHaveBeenCalledTimes(1)
    // La creación aparece en la lista, re-abrible.
    expect(
      screen.getByRole('button', { name: /Abrir Mi receta para editar/i }),
    ).toBeInTheDocument()
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

    // Marcar la primera y eliminarla desde la barra de edición → queda una.
    await user.click(screen.getByRole('button', { name: /Incluir la hoja 1 en el PDF/i }))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(screen.queryByAltText('Página 2')).not.toBeInTheDocument()
    expect(screen.getByText(/1 página/)).toBeInTheDocument()
    expect(mocks.forgetThumb).toHaveBeenCalled()

    // Guardar → ensambla + abre el PDF en el visor del navegador.
    await user.click(screen.getByRole('button', { name: /Guardar PDF/i }))
    expect(mocks.assemble).toHaveBeenCalledTimes(1)
    expect(mocks.showPdfInTab).toHaveBeenCalledTimes(1)
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

    // Marcar la primera y rotarla desde la barra de edición.
    await user.click(screen.getByRole('button', { name: /Incluir la hoja 1 en el PDF/i }))
    await user.click(screen.getByRole('button', { name: /Rotar a la derecha/i }))
    // La página sigue ahí y ahora hay historial para deshacer la rotación.
    expect(screen.getByAltText('Página 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Deshacer/i })).toBeEnabled()
  })

  it('agrega texto a una página y la deja marcada', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    // Abrir el editor con doble clic en la miniatura.
    await user.dblClick(screen.getByAltText('Página 1'))
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

    await user.dblClick(screen.getByAltText('Página 1'))
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

    await user.click(screen.getByRole('button', { name: /Incluir la hoja 1 en el PDF/i }))
    await user.click(screen.getByRole('button', { name: /Incluir la hoja 2 en el PDF/i }))

    // La barra de edición (siempre visible) refleja el conteo de marcadas.
    expect(screen.getByRole('toolbar', { name: /edición de hojas/i })).toBeInTheDocument()
    expect(screen.getByText(/2 marcadas/)).toBeInTheDocument()

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

    await user.click(screen.getByRole('button', { name: /Incluir la hoja 1 en el PDF/i }))
    await user.click(screen.getByRole('button', { name: 'Duplicar' }))
    expect(screen.getByText(/3 páginas/)).toBeInTheDocument()
  })

  it('la barra de edición está siempre visible y "Texto" abre la hoja marcada', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    // La barra aparece sin marcar nada; "Texto" está deshabilitado.
    expect(screen.getByRole('toolbar', { name: /edición de hojas/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Texto' })).toBeDisabled()

    // Marcar 1 hoja → "Texto" abre el editor de esa página.
    await user.click(screen.getByRole('button', { name: /Incluir la hoja 1 en el PDF/i }))
    await user.click(screen.getByRole('button', { name: 'Texto' }))
    expect(
      await screen.findByRole('dialog', { name: /Texto sobre la página 1/i }),
    ).toBeInTheDocument()
  })

  it('Guardar PDF refleja la marca y exporta sólo las hojas marcadas', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    // Sin marcar: guarda todo.
    expect(screen.getByRole('button', { name: /^Guardar PDF$/i })).toBeInTheDocument()

    // Marco una hoja → el botón muestra el conteo y exporta el subconjunto.
    await user.click(screen.getByRole('button', { name: /Incluir la hoja 1 en el PDF/i }))
    await user.click(screen.getByRole('button', { name: /Guardar PDF \(1\)/i }))
    expect(mocks.assemble).toHaveBeenCalledTimes(1)
    expect(mocks.showPdfInTab).toHaveBeenCalledTimes(1)
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

  it('elimina las páginas marcadas con la tecla Suprimir', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    await user.click(screen.getByRole('button', { name: /Incluir la hoja 1 en el PDF/i }))
    await user.click(screen.getByRole('button', { name: /Incluir la hoja 2 en el PDF/i }))
    await user.keyboard('{Delete}')

    expect(screen.getByText(/Arrastra PDFs o imágenes/)).toBeInTheDocument()
    expect(screen.queryByAltText('Página 1')).not.toBeInTheDocument()
  })

  it('copia y pega una página marcada con ⌘C/⌘V (2 → 3)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')
    expect(screen.getByText(/2 páginas/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Incluir la hoja 1 en el PDF/i }))
    await user.keyboard('{Meta>}c{/Meta}')
    await user.keyboard('{Meta>}v{/Meta}')

    expect(screen.getByText(/3 páginas/)).toBeInTheDocument()
  })
})
