import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, screen, within } from '@testing-library/react'
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
  assemblePdfInWorker: vi.fn(),
  createSearchablePdfInWorker: vi.fn(),
  inspectPdfFormInWorker: vi.fn(),
  fillPdfFormInWorker: vi.fn(),
  writePdfFormFieldsInWorker: vi.fn(),
  downloadBlob: vi.fn(),
  openPdfPreview: vi.fn(),
  printPdfBlob: vi.fn(),
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
  listSavedDocs: vi.fn(),
  listSavedFolders: vi.fn(),
  putSavedDoc: vi.fn(),
  putSavedFolder: vi.fn(),
  deleteSavedDoc: vi.fn(),
}))
vi.mock('../../../lib/pdfStudio/render/pdfRender', () => ({
  getPdfPageCount: mocks.getPdfPageCount,
  renderPageThumb: mocks.renderPageThumb,
  renderPageBitmap: mocks.renderPageBitmap,
  forgetThumb: mocks.forgetThumb,
  disposePdfStudio: mocks.disposePdfStudio,
  openPdfPreview: mocks.openPdfPreview,
}))
vi.mock('../../../lib/pdfStudio/assemble/assemble', () => ({ assemble: mocks.assemble }))
vi.mock('../../../lib/pdfStudio/export/exportWorkerClient', () => ({
  assemblePdfInWorker: mocks.assemblePdfInWorker,
}))
vi.mock('../../../lib/pdfStudio/ocr/pdfOcrWorkerClient', () => ({
  createSearchablePdfInWorker: mocks.createSearchablePdfInWorker,
}))
vi.mock('../../../lib/pdfStudio/forms/pdfFormWorkerClient', () => ({
  inspectPdfFormInWorker: mocks.inspectPdfFormInWorker,
  fillPdfFormInWorker: mocks.fillPdfFormInWorker,
  writePdfFormFieldsInWorker: mocks.writePdfFormFieldsInWorker,
}))
vi.mock('../../../lib/pdfStudio/export/printPdf', () => ({
  printPdfBlob: mocks.printPdfBlob,
}))
vi.mock('../../../lib/downloadBlob', () => ({ downloadBlob: mocks.downloadBlob }))
vi.mock('../../../lib/pdfStudio/render/persistence', () => ({
  loadDraft: mocks.loadDraft,
  saveDraft: mocks.saveDraft,
  clearDraft: mocks.clearDraft,
  listSavedDocs: mocks.listSavedDocs,
  listSavedFolders: mocks.listSavedFolders,
  putSavedDoc: mocks.putSavedDoc,
  putSavedFolder: mocks.putSavedFolder,
  deleteSavedDoc: mocks.deleteSavedDoc,
  isSavedTemplate: (saved: { kind?: string; doc: { formFields?: unknown[] } }) =>
    (saved.kind ??
      ((saved.doc.formFields?.length ?? 0) > 0 ? 'template' : 'creation')) === 'template',
  isSavedFilledTemplate: (saved: { kind?: string }) => saved.kind === 'filled-template',
}))

import { PdfStudioView } from './PdfStudioView'
import {
  addPdfFormField,
  addPdfSource,
  emptyDoc,
  makePdfFormFieldDraft,
} from '../../../lib/pdfStudio/model/model'

const pdfFile = (name = 'doc.pdf') =>
  new File(['%PDF-1.4'], name, { type: 'application/pdf' })

function templateDoc() {
  const doc = addPdfSource(emptyDoc(), pdfFile('planilla.pdf'), 1)
  return addPdfFormField(
    doc,
    makePdfFormFieldDraft({
      fieldKind: 'text',
      pageId: doc.pages[0]!.id,
      name: 'paciente',
      value: '',
      xRatio: 0.2,
      yRatio: 0.25,
      wRatio: 0.3,
      hRatio: 0.05,
    }),
  )
}

function filledTemplateDoc() {
  const doc = templateDoc()
  return {
    ...doc,
    formFields: doc.formFields?.map((field) => ({ ...field, value: 'Daniel' })),
  }
}

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
  mocks.assemblePdfInWorker.mockResolvedValue({
    blob: new Blob(['pdf'], { type: 'application/pdf' }),
    skipped: [],
    warnings: [],
  })
  mocks.createSearchablePdfInWorker.mockResolvedValue({
    pdfBlob: new Blob(['searchable'], { type: 'application/pdf' }),
    textBlob: new Blob(['texto ocr'], { type: 'text/plain' }),
    pages: [{ pageNumber: 1, text: 'texto ocr', confidence: 90 }],
    warnings: [],
  })
  mocks.inspectPdfFormInWorker.mockResolvedValue({ fieldCount: 0, fields: [] })
  mocks.fillPdfFormInWorker.mockResolvedValue({
    blob: new Blob(['filled'], { type: 'application/pdf' }),
  })
  mocks.writePdfFormFieldsInWorker.mockResolvedValue({
    blob: new Blob(['with-forms'], { type: 'application/pdf' }),
  })
  mocks.openPdfPreview.mockResolvedValue({
    numPages: 1,
    renderPage: vi.fn().mockResolvedValue('blob:preview'),
    dispose: vi.fn(),
  })
  mocks.loadDraft.mockResolvedValue(null) // sin borrador por defecto
  mocks.saveDraft.mockResolvedValue(undefined)
  mocks.clearDraft.mockResolvedValue(undefined)
  mocks.listSavedDocs.mockResolvedValue([]) // sin guardados por defecto
  mocks.listSavedFolders.mockResolvedValue([])
  mocks.putSavedDoc.mockResolvedValue(undefined)
  mocks.putSavedFolder.mockResolvedValue(undefined)
  mocks.deleteSavedDoc.mockResolvedValue(undefined)
})

describe('<PdfStudioView />', () => {
  it('muestra el estado vacío con Guardar deshabilitado', () => {
    renderWithProviders(<PdfStudioView />)
    expect(screen.getByText(/Trae un PDF o unas imágenes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar PDF/i })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /Importar PDF o imagen/i }),
    ).toHaveTextContent('Importar')
    expect(
      screen.getByRole('button', { name: /Más acciones del documento/i }),
    ).toBeInTheDocument()
  })

  it('en modo planillas usa estado vacío, modo y acción primaria propios', () => {
    renderWithProviders(<PdfStudioView studioMode="templates" />)

    expect(screen.getByText(/Sube un PDF o imagen para empezar/i)).toBeInTheDocument()
    expect(screen.getByText(/Una planilla empieza con una hoja/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar planilla/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Guardar PDF/i })).not.toBeInTheDocument()
  })

  it('guía la creación de planillas desde base hasta casilleros', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView studioMode="templates" />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    expect(
      screen.getByText(/Doble clic en una hoja para marcar los casilleros/i),
    ).toBeInTheDocument()

    // Se entra al diseño con doble clic en la hoja (ya no hay botón "Agregar
    // casilleros": era redundante con este gesto).
    await user.dblClick(screen.getByAltText('Página 1'))
    expect(
      await screen.findByRole('dialog', { name: /Crear plantilla/i }),
    ).toBeInTheDocument()
    const designHeader = screen.getByRole('banner', { name: /Crear plantilla/i })
    expect(designHeader).toHaveTextContent('0 casilleros')
    expect(
      within(designHeader).getByRole('button', { name: /Crear casillero/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Aplicar casilleros/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Listo$/i })).not.toBeInTheDocument()
  })

  it('la guía resume los casilleros y no repite acciones de la barra', async () => {
    mocks.loadDraft.mockResolvedValueOnce({ doc: templateDoc(), library: [] })
    renderWithProviders(<PdfStudioView studioMode="templates" />)

    await screen.findByAltText('Página 1')
    expect(screen.getByText(/1 campo marcado/i)).toBeInTheDocument()
    expect(screen.getByText(/guárdala como plantilla/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Subir PDF\/imagen/i }),
    ).not.toBeInTheDocument()
  })

  it('Guardar planilla abre el nombre de guardado cuando hay casilleros', async () => {
    const user = userEvent.setup()
    mocks.loadDraft.mockResolvedValueOnce({ doc: templateDoc(), library: [] })
    renderWithProviders(<PdfStudioView studioMode="templates" />)

    await screen.findByAltText('Página 1')
    await user.click(screen.getByRole('button', { name: /^Guardar planilla$/i }))

    expect(
      await screen.findByPlaceholderText(/Nombre de la planilla/i),
    ).toBeInTheDocument()
  })

  it('en planillas abre el editor de casilleros con doble clic en la hoja', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView studioMode="templates" />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    await user.dblClick(screen.getByAltText('Página 1'))

    expect(
      await screen.findByRole('dialog', { name: /Crear plantilla/i }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Campos' }))
    expect(
      screen.getByRole('menuitem', { name: /Crear casillero de texto/i }),
    ).toBeInTheDocument()
  })

  it('en planillas la miniatura comunica creación de plantilla, no edición PDF genérica', async () => {
    renderWithProviders(<PdfStudioView studioMode="templates" />)
    await userEvent.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    expect(screen.getAllByTitle(/Doble clic para crear plantilla/i)).toHaveLength(2)
    expect(screen.queryByTitle(/Doble clic para ver y editar/i)).toBeNull()
  })

  it('la barra principal mantiene una fila compacta con Nuevo documento a la par del guardado', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)

    const toolbar = screen.getByRole('toolbar', { name: /Acciones del documento PDF/i })
    expect(toolbar).toHaveClass('flex-nowrap')
    expect(toolbar).not.toHaveClass('rounded-lg')
    // "Nuevo documento" salió del menú y es un botón primario en Imprenta.
    expect(
      within(toolbar).getByRole('button', { name: /Nuevo documento/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Más acciones del documento/i }))
    // "Descargar" ya no vive en el menú (Guardar PDF abre la vista previa para
    // descargar) y "Nuevo documento" se promovió a botón.
    expect(screen.queryByRole('menuitem', { name: /Descargar/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('menuitem', { name: /Nuevo documento/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('menuitem', { name: /Detectar formularios/i }),
    ).not.toBeInTheDocument()
  })

  it('en modo editor PDF no muestra ni ejecuta planillas guardadas', async () => {
    mocks.listSavedDocs.mockResolvedValueOnce([
      { id: 'tpl-1', name: 'Ingreso paciente', doc: templateDoc(), savedAt: 1000 },
    ])
    renderWithProviders(<PdfStudioView studioMode="editor" />)

    expect(await screen.findByText(/Trae un PDF o unas imágenes/)).toBeInTheDocument()
    expect(screen.queryByText('Planillas')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: /Rellenar planilla Ingreso paciente/i,
      }),
    ).not.toBeInTheDocument()
  })

  it('en modo editor PDF ignora el modo planilla aunque el borrador tenga casilleros', async () => {
    mocks.loadDraft.mockResolvedValueOnce({ doc: templateDoc(), library: [] })
    renderWithProviders(<PdfStudioView studioMode="editor" />)

    expect(await screen.findByAltText('Página 1')).toBeInTheDocument()
    expect(screen.queryByText(/Rellenar planilla/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Imprimir planilla/i }),
    ).not.toBeInTheDocument()
  })

  it('limpia el modo rellenar al pasar desde Planillas a Imprenta', async () => {
    const user = userEvent.setup()
    mocks.listSavedDocs.mockResolvedValueOnce([
      { id: 'tpl-1', name: 'Ingreso paciente', doc: templateDoc(), savedAt: 1000 },
    ])
    const view = renderWithProviders(<PdfStudioView studioMode="templates" />)

    await user.click(
      await screen.findByRole('button', {
        name: /Rellenar planilla Ingreso paciente/i,
      }),
    )
    const fillDialog = await screen.findByRole('dialog', { name: /Rellenar planilla/i })
    await user.click(within(fillDialog).getByRole('button', { name: /Cerrar/i }))

    view.rerender(<PdfStudioView studioMode="editor" />)

    expect(screen.queryByText(/Rellenar planilla/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Imprimir planilla/i }),
    ).not.toBeInTheDocument()
  })

  it('Editar plantilla abre el editor directamente (sin doble clic en el documento)', async () => {
    const user = userEvent.setup()
    mocks.listSavedDocs.mockResolvedValueOnce([
      { id: 'tpl-1', name: 'Ingreso paciente', doc: templateDoc(), savedAt: 1000 },
    ])
    renderWithProviders(<PdfStudioView studioMode="templates" />)

    await user.click(
      await screen.findByRole('button', {
        name: /Editar estructura de planilla Ingreso paciente/i,
      }),
    )

    // Se abre el editor de diseño directo (no hace falta doble clic en la hoja).
    expect(
      await screen.findByRole('dialog', { name: /Crear plantilla/i }),
    ).toBeInTheDocument()
  })

  it('abre una planilla directamente en visor simplificado para rellenar e imprimir', async () => {
    const user = userEvent.setup()
    mocks.listSavedDocs.mockResolvedValueOnce([
      { id: 'tpl-1', name: 'Ingreso paciente', doc: templateDoc(), savedAt: 1000 },
    ])
    renderWithProviders(<PdfStudioView studioMode="templates" />)

    await user.click(
      await screen.findByRole('button', {
        name: /Rellenar planilla Ingreso paciente/i,
      }),
    )

    expect(
      await screen.findByRole('dialog', { name: /Rellenar planilla/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Agregar cuadro de texto/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: /Inspector/i })).toBeNull()
    const fillDialog = screen.getByRole('dialog', { name: /Rellenar planilla/i })
    expect(within(fillDialog).queryByRole('button', { name: /^Guardar$/i })).toBeNull()
    expect(
      within(fillDialog).queryByRole('button', { name: /Editar estructura/i }),
    ).toBeNull()

    const input = screen.getByRole('textbox', { name: 'paciente' })
    expect(input).toHaveAttribute('placeholder', 'Escriba aquí')
    expect(screen.getAllByText('[paciente]').length).toBeGreaterThanOrEqual(1)
    await user.type(input, 'Daniel')
    await user.click(
      within(fillDialog).getByRole('button', { name: /Imprimir planilla/i }),
    )

    // "Imprimir planilla" abre la planilla rellenada (campos aplicados) en la
    // vista previa en modal, desde donde se imprime o descarga.
    expect(
      await screen.findByRole('dialog', { name: /Vista previa del PDF/i }),
    ).toBeInTheDocument()
    expect(mocks.assemblePdfInWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        formFields: [expect.objectContaining({ name: 'paciente', value: 'Daniel' })],
      }),
      expect.anything(),
    )
    expect(mocks.writePdfFormFieldsInWorker).toHaveBeenCalledWith(
      expect.any(File),
      [expect.objectContaining({ name: 'paciente', value: 'Daniel' })],
      expect.any(Array),
      { flatten: true },
      expect.anything(),
    )
  })

  it('permite completar una planilla desde el panel lateral de variables', async () => {
    const user = userEvent.setup()
    mocks.listSavedDocs.mockResolvedValueOnce([
      { id: 'tpl-1', name: 'Ingreso paciente', doc: templateDoc(), savedAt: 1000 },
    ])
    renderWithProviders(<PdfStudioView studioMode="templates" />)

    await user.click(
      await screen.findByRole('button', {
        name: /Rellenar planilla Ingreso paciente/i,
      }),
    )
    const fillDialog = await screen.findByRole('dialog', { name: /Rellenar planilla/i })
    expect(
      within(fillDialog).getByRole('complementary', { name: /Variables de planilla/i }),
    ).toBeInTheDocument()
    expect(within(fillDialog).getByText('1 campo pendiente')).toBeInTheDocument()

    await user.type(
      within(fillDialog).getByRole('textbox', { name: /Variable paciente/i }),
      'Camila',
    )
    await user.click(
      within(fillDialog).getByRole('button', { name: /Imprimir planilla/i }),
    )

    // Abre la vista previa en modal con la planilla rellenada.
    await screen.findByRole('dialog', { name: /Vista previa del PDF/i })
    expect(mocks.assemblePdfInWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        formFields: [expect.objectContaining({ name: 'paciente', value: 'Camila' })],
      }),
      expect.anything(),
    )
  })

  it('presenta el modo relleno como superficie simple de completar e imprimir', async () => {
    const user = userEvent.setup()
    mocks.listSavedDocs.mockResolvedValueOnce([
      { id: 'tpl-1', name: 'Ingreso paciente', doc: templateDoc(), savedAt: 1000 },
    ])
    renderWithProviders(<PdfStudioView studioMode="templates" />)

    await user.click(
      await screen.findByRole('button', {
        name: /Rellenar planilla Ingreso paciente/i,
      }),
    )
    const fillDialog = await screen.findByRole('dialog', { name: /Rellenar planilla/i })

    expect(
      within(fillDialog).getByRole('main', { name: /Área de relleno de planilla/i }),
    ).toBeInTheDocument()
    expect(
      within(fillDialog).getByRole('banner', { name: /Rellenar planilla/i }),
    ).toHaveTextContent('0 de 1 campos completos')
    expect(within(fillDialog).queryByRole('button', { name: /Deshacer/i })).toBeNull()
    expect(within(fillDialog).queryByRole('button', { name: /^Listo$/i })).toBeNull()
    expect(within(fillDialog).getByText('Datos de esta copia')).toBeInTheDocument()
    expect(within(fillDialog).getByText('0/1')).toBeInTheDocument()
    expect(
      within(fillDialog).getByRole('button', { name: /Ir al siguiente campo/i }),
    ).toBeEnabled()
    expect(
      within(fillDialog).queryByRole('toolbar', { name: /Herramientas de edición/i }),
    ).toBeNull()
  })

  it('deja los campos especiales fuera del editor PDF general', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView studioMode="editor" />)
    await user.upload(fileInput(), pdfFile())
    await user.dblClick(await screen.findByAltText('Página 1'))
    await screen.findByRole('dialog', { name: /Editar página 1/i })

    expect(screen.queryByRole('button', { name: 'Campos' })).not.toBeInTheDocument()
  })

  it('abre el editor con una ventana amplia para PDF y planillas', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView studioMode="templates" />)
    await user.upload(fileInput(), pdfFile())
    await user.dblClick(await screen.findByAltText('Página 1'))

    const dialog = await screen.findByRole('dialog', { name: /Crear plantilla/i })
    expect(dialog.firstElementChild).toHaveClass('max-w-[min(1360px,85vw)]')
  })

  it('en planillas v1 permite crear solo casilleros de texto', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView studioMode="templates" />)
    await user.upload(fileInput(), pdfFile())
    await user.dblClick(await screen.findByAltText('Página 1'))
    await screen.findByRole('dialog', { name: /Crear plantilla/i })

    expect(screen.getByRole('button', { name: 'Campos' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Campos' }))
    expect(
      screen.getByRole('menuitem', { name: /Crear casillero de texto/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Crear campo Firma/i })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /Crear campo Checkbox/i })).toBeNull()
  })

  it('autoguarda cambios estructurales al crear casilleros en modo edición de planilla', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView studioMode="templates" />)
    await user.upload(fileInput(), pdfFile())
    await user.dblClick(await screen.findByAltText('Página 1'))

    const dialog = await screen.findByRole('dialog', { name: /Crear plantilla/i })
    const designHeader = within(dialog).getByRole('banner', {
      name: /Crear plantilla/i,
    })
    await user.click(
      within(designHeader).getByRole('button', { name: /Crear casillero/i }),
    )
    await user.click(within(dialog).getByAltText('Página 1'))
    await user.click(within(dialog).getByRole('button', { name: /Aplicar casilleros/i }))

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 700))
    })

    expect(
      mocks.saveDraft.mock.calls.some(
        (call) => Array.isArray(call[1].formFields) && call[1].formFields.length > 0,
      ),
    ).toBe(true)
  })

  it('conserva cambios estructurales al cerrar el modo Crear plantilla', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView studioMode="templates" />)
    await user.upload(fileInput(), pdfFile())
    await user.dblClick(await screen.findByAltText('Página 1'))

    const dialog = await screen.findByRole('dialog', { name: /Crear plantilla/i })
    const designHeader = within(dialog).getByRole('banner', {
      name: /Crear plantilla/i,
    })
    await user.click(
      within(designHeader).getByRole('button', { name: /Crear casillero/i }),
    )
    await user.click(within(dialog).getByAltText('Página 1'))
    await user.click(
      within(designHeader).getByRole('button', { name: /Guardar y cerrar/i }),
    )

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 700))
    })

    expect(
      mocks.saveDraft.mock.calls.some(
        (call) => Array.isArray(call[1].formFields) && call[1].formFields.length > 0,
      ),
    ).toBe(true)
  })

  it('conserva cambios estructurales al cerrar Crear plantilla desde el fondo', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView studioMode="templates" />)
    await user.upload(fileInput(), pdfFile())
    await user.dblClick(await screen.findByAltText('Página 1'))

    const dialog = await screen.findByRole('dialog', { name: /Crear plantilla/i })
    const designHeader = within(dialog).getByRole('banner', {
      name: /Crear plantilla/i,
    })
    await user.click(
      within(designHeader).getByRole('button', { name: /Crear casillero/i }),
    )
    await user.click(within(dialog).getByAltText('Página 1'))

    fireEvent.pointerDown(dialog, { clientX: 8, clientY: 8 })
    fireEvent.click(dialog, { clientX: 8, clientY: 8 })

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 700))
    })

    expect(
      mocks.saveDraft.mock.calls.some(
        (call) => Array.isArray(call[1].formFields) && call[1].formFields.length > 0,
      ),
    ).toBe(true)
  })

  it('descarga una planilla como PDF rellenable editable sin aplanar campos', async () => {
    const user = userEvent.setup()
    mocks.loadDraft.mockResolvedValueOnce({ doc: templateDoc(), library: [] })
    renderWithProviders(<PdfStudioView studioMode="templates" />)

    await screen.findByAltText('Página 1')
    await user.click(screen.getByRole('button', { name: /Más acciones del documento/i }))
    await user.click(screen.getByRole('menuitem', { name: /Descargar PDF rellenable/i }))

    expect(mocks.writePdfFormFieldsInWorker).toHaveBeenCalledWith(
      expect.any(File),
      [expect.objectContaining({ name: 'paciente', value: '' })],
      expect.any(Array),
      { flatten: false },
      expect.anything(),
    )
    // La descarga sale de la vista previa en modal (gesto fresco del click →
    // funciona en Safari/WebKit, que bloquea descargas post-async del menú).
    const preview = await screen.findByRole('dialog', { name: /Vista previa del PDF/i })
    await user.click(within(preview).getByRole('button', { name: /Descargar/i }))
    expect(mocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringMatching(/rellenable.*\.pdf$/),
    )
  })

  it('imprime datos de una planilla sin guardarlos en el borrador reutilizable', async () => {
    const user = userEvent.setup()
    mocks.listSavedDocs.mockResolvedValueOnce([
      { id: 'tpl-1', name: 'Ingreso paciente', doc: templateDoc(), savedAt: 1000 },
    ])
    renderWithProviders(<PdfStudioView studioMode="templates" />)

    await user.click(
      await screen.findByRole('button', {
        name: /Rellenar planilla Ingreso paciente/i,
      }),
    )
    const fillDialog = await screen.findByRole('dialog', { name: /Rellenar planilla/i })
    await user.type(screen.getByRole('textbox', { name: 'paciente' }), 'Daniel')
    await user.click(
      within(fillDialog).getByRole('button', { name: /Imprimir planilla/i }),
    )

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 700))
    })

    expect(mocks.assemblePdfInWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        formFields: [expect.objectContaining({ value: 'Daniel' })],
      }),
      expect.anything(),
    )
    expect(
      mocks.saveDraft.mock.calls.some((call) =>
        JSON.stringify(call[1]).includes('Daniel'),
      ),
    ).toBe(false)
  })

  it('permite guardar una copia con datos sin contaminar la planilla reusable', async () => {
    const user = userEvent.setup()
    mocks.listSavedDocs.mockResolvedValueOnce([
      { id: 'tpl-1', name: 'Ingreso paciente', doc: templateDoc(), savedAt: 1000 },
    ])
    renderWithProviders(<PdfStudioView studioMode="templates" />)

    await user.click(
      await screen.findByRole('button', {
        name: /Rellenar planilla Ingreso paciente/i,
      }),
    )
    const fillDialog = await screen.findByRole('dialog', { name: /Rellenar planilla/i })
    await user.type(screen.getByRole('textbox', { name: 'paciente' }), 'Daniel')
    await user.click(
      within(fillDialog).getByRole('button', { name: /Guardar copia con datos/i }),
    )

    expect(mocks.putSavedDoc).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        name: expect.stringMatching(/Ingreso paciente.+datos/i),
        kind: 'filled-template',
        doc: expect.objectContaining({
          formFields: [expect.objectContaining({ name: 'paciente', value: 'Daniel' })],
        }),
      }),
    )
    expect(
      mocks.saveDraft.mock.calls.some((call) =>
        JSON.stringify(call[1]).includes('Daniel'),
      ),
    ).toBe(false)
  })

  it('abre copias con datos en modo relleno, no como edición de estructura', async () => {
    const user = userEvent.setup()
    mocks.listSavedDocs.mockResolvedValueOnce([
      {
        id: 'filled-1',
        name: 'Ingreso paciente datos',
        doc: filledTemplateDoc(),
        savedAt: 1200,
        kind: 'filled-template',
      },
    ])
    renderWithProviders(<PdfStudioView studioMode="templates" />)

    await user.click(
      await screen.findByRole('button', {
        name: /Abrir copia con datos Ingreso paciente datos/i,
      }),
    )

    const fillDialog = await screen.findByRole('dialog', { name: /Rellenar planilla/i })
    expect(
      within(fillDialog).getByRole('textbox', { name: /Variable paciente/i }),
    ).toHaveValue('Daniel')
    expect(
      within(fillDialog).queryByRole('button', { name: /Crear casillero/i }),
    ).toBeNull()
    expect(
      within(fillDialog).queryByRole('button', { name: /Aplicar casilleros/i }),
    ).toBeNull()
    expect(
      within(fillDialog).getByRole('button', { name: /Imprimir planilla/i }),
    ).toBeInTheDocument()
  })

  it('no autoguarda datos de una copia rellenada como borrador base', async () => {
    const user = userEvent.setup()
    mocks.listSavedDocs.mockResolvedValueOnce([
      {
        id: 'filled-1',
        name: 'Ingreso paciente datos',
        doc: filledTemplateDoc(),
        savedAt: 1200,
        kind: 'filled-template',
      },
    ])
    renderWithProviders(<PdfStudioView studioMode="templates" />)

    await user.click(
      await screen.findByRole('button', {
        name: /Abrir copia con datos Ingreso paciente datos/i,
      }),
    )
    await screen.findByRole('dialog', { name: /Rellenar planilla/i })

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 700))
    })

    expect(
      mocks.saveDraft.mock.calls.some((call) =>
        JSON.stringify(call[1]).includes('Daniel'),
      ),
    ).toBe(false)
  })

  it('detecta formularios AcroForm desde el menú de documento en Planillas', async () => {
    const user = userEvent.setup()
    mocks.inspectPdfFormInWorker.mockResolvedValueOnce({
      fieldCount: 2,
      fields: [
        { name: 'fullName', type: 'text', value: '' },
        { name: 'approved', type: 'checkbox', value: false },
      ],
    })
    renderWithProviders(<PdfStudioView studioMode="templates" />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    await user.click(screen.getByRole('button', { name: /Más acciones del documento/i }))
    await user.click(screen.getByRole('menuitem', { name: /Detectar formularios/i }))

    expect(mocks.inspectPdfFormInWorker).toHaveBeenCalledTimes(1)
    expect(mocks.inspectPdfFormInWorker.mock.calls[0]![0]).toBeInstanceOf(File)
    expect(await screen.findByText(/2 campos de formulario/i)).toBeInTheDocument()
  })

  it('rellena formularios detectados y los aplica como PDF editable en Planillas', async () => {
    const user = userEvent.setup()
    mocks.inspectPdfFormInWorker.mockResolvedValueOnce({
      fieldCount: 2,
      fields: [
        { name: 'fullName', type: 'text', value: '' },
        { name: 'approved', type: 'checkbox', value: false },
      ],
    })
    renderWithProviders(<PdfStudioView studioMode="templates" />)
    await user.upload(fileInput(), pdfFile('formulario.pdf'))
    await screen.findByAltText('Página 1')

    await user.click(screen.getByRole('button', { name: /Más acciones del documento/i }))
    await user.click(screen.getByRole('menuitem', { name: /Detectar formularios/i }))

    const nameInput = await screen.findByRole('textbox', { name: 'fullName' })
    await user.type(nameInput, 'Ada Lovelace')
    await user.click(screen.getByRole('checkbox', { name: 'approved' }))
    await user.click(screen.getByRole('button', { name: /Aplicar editable/i }))

    expect(mocks.fillPdfFormInWorker).toHaveBeenCalledWith(
      expect.any(File),
      { fullName: 'Ada Lovelace', approved: true },
      { flatten: false },
    )
    expect(
      await screen.findByText(/Formulario aplicado como editable/i),
    ).toBeInTheDocument()

    mocks.fillPdfFormInWorker.mockClear()
    await user.click(screen.getByRole('button', { name: /Aplanar formulario/i }))
    expect(mocks.fillPdfFormInWorker).toHaveBeenCalledWith(
      expect.any(File),
      { fullName: 'Ada Lovelace', approved: true },
      { flatten: true },
    )
  })

  it('crea PDF buscable con OCR y descarga sidecar txt', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile('escaneo.pdf'))
    await screen.findByAltText('Página 1')

    await user.click(screen.getByRole('button', { name: /Más acciones del documento/i }))
    await user.click(screen.getByRole('menuitem', { name: /OCR buscable/i }))

    expect(
      await screen.findByRole('region', { name: /OCR buscable/i }),
    ).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/Idioma OCR/i), 'eng')
    await user.click(screen.getByRole('button', { name: /Crear PDF buscable/i }))

    expect(mocks.assemblePdfInWorker).toHaveBeenCalledTimes(1)
    expect(mocks.createSearchablePdfInWorker).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ language: 'eng' }),
    )
    expect(mocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringMatching(/ocr\.pdf$/),
    )
    expect(mocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringMatching(/ocr\.txt$/),
    )
    expect(await screen.findByText(/OCR completado/i)).toBeInTheDocument()
  })

  it('muestra límite client-side y bloquea OCR en documentos demasiado grandes', async () => {
    const user = userEvent.setup()
    mocks.loadDraft.mockResolvedValue({
      doc: addPdfSource(emptyDoc(), pdfFile('archivo-grande.pdf'), 55),
      library: [],
    })
    renderWithProviders(<PdfStudioView />)
    await screen.findByText(/55 páginas/i)

    await user.click(screen.getByRole('button', { name: /Más acciones del documento/i }))
    await user.click(screen.getByRole('menuitem', { name: /OCR buscable/i }))

    const panel = await screen.findByRole('region', { name: /OCR buscable/i })
    expect(within(panel).getByRole('alert')).toHaveTextContent(/55 páginas/i)
    expect(within(panel).getByRole('alert')).toHaveTextContent(/OCRmyPDF/i)
    expect(
      within(panel).getByRole('button', { name: /Crear PDF buscable/i }),
    ).toBeDisabled()
  })

  it('cancela OCR sin descargar archivos ni dejar la UI procesando', async () => {
    const user = userEvent.setup()
    mocks.assemblePdfInWorker.mockImplementationOnce(
      (_doc, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new DOMException('Operación cancelada.', 'AbortError'))
          })
        }),
    )
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile('escaneo.pdf'))
    await screen.findByAltText('Página 1')

    await user.click(screen.getByRole('button', { name: /Más acciones del documento/i }))
    await user.click(screen.getByRole('menuitem', { name: /OCR buscable/i }))
    await user.click(screen.getByRole('button', { name: /Crear PDF buscable/i }))
    await user.click(await screen.findByRole('button', { name: /Cancelar/i }))

    expect(await screen.findByText(/OCR cancelado/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Crear PDF buscable/i })).toBeEnabled()
    expect(mocks.createSearchablePdfInWorker).not.toHaveBeenCalled()
    expect(mocks.downloadBlob).not.toHaveBeenCalled()
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
    // La sección "Imágenes" arranca colapsada; la abrimos para reutilizar.
    await user.click(screen.getByRole('button', { name: /Imágenes/i }))
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
    await user.click(screen.getByRole('button', { name: /Marcar la hoja 1/i }))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(screen.queryByAltText('Página 2')).not.toBeInTheDocument()
    expect(screen.getByText(/1 página/)).toBeInTheDocument()
    expect(mocks.forgetThumb).toHaveBeenCalled()

    // Guardar → ensambla + abre la vista previa en modal (no descarga directa).
    await user.click(screen.getByRole('button', { name: /Guardar PDF/i }))
    const preview = await screen.findByRole('dialog', { name: /Vista previa del PDF/i })
    expect(mocks.assemblePdfInWorker).toHaveBeenCalledTimes(1)
    expect(mocks.assemble).not.toHaveBeenCalled()
    expect(mocks.downloadBlob).not.toHaveBeenCalled()
    // "Imprimir" imprime el PDF dentro de la app (diálogo del navegador).
    await user.click(within(preview).getByRole('button', { name: /Imprimir/i }))
    expect(mocks.printPdfBlob).toHaveBeenCalledTimes(1)
  })

  it('undo y redo revierten y reaplican la importación', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')
    expect(screen.getByText(/2 páginas/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Deshacer/i }))
    expect(screen.getByText(/Trae un PDF o unas imágenes/)).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: /Marcar la hoja 1/i }))
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
      await screen.findByRole('dialog', { name: /Editar página 1/i }),
    ).toBeInTheDocument()

    // Agregar un texto (la edición del contenido es INLINE sobre el cuadro, que
    // necesita el fondo renderizado y no corre en happy-dom; acá basta con que la
    // anotación se cree y se confirme).
    await user.click(screen.getByRole('button', { name: /Agregar cuadro de texto/i }))

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
    await screen.findByRole('dialog', { name: /Editar página 1/i })
    await user.click(screen.getByRole('button', { name: /Agregar cuadro de texto/i }))
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
    await screen.findByRole('button', { name: /Importar PDF o imagen/i })
    expect(mocks.getPdfPageCount).toHaveBeenCalledTimes(1)
    // No se agregó ninguna página: sigue el estado vacío y Guardar deshabilitado.
    expect(screen.getByText(/Trae un PDF o unas imágenes/)).toBeInTheDocument()
    expect(screen.queryByAltText('Página 1')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar PDF/i })).toBeDisabled()
  })

  it('selecciona varias páginas y las elimina en lote', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')
    expect(screen.getByText(/2 páginas/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Marcar la hoja 1/i }))
    await user.click(screen.getByRole('button', { name: /Marcar la hoja 2/i }))

    // La barra de edición (siempre visible) refleja el conteo de marcadas.
    expect(
      screen.getByRole('toolbar', { name: /Barra de hojas de PDF/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/2 marcadas/)).toBeInTheDocument()

    // Eliminar en lote → documento vacío.
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(screen.getByText(/Trae un PDF o unas imágenes/)).toBeInTheDocument()
    expect(screen.queryByAltText('Página 1')).not.toBeInTheDocument()
  })

  it('duplica una página seleccionada en lote (2 → 3)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    await user.click(screen.getByRole('button', { name: /Marcar la hoja 1/i }))
    await user.click(screen.getByRole('button', { name: 'Duplicar' }))
    expect(screen.getByText(/3 páginas/)).toBeInTheDocument()
  })

  it('la barra de edición de hojas no mezcla acciones de texto', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    expect(
      screen.getByRole('toolbar', { name: /Barra de hojas de PDF/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Texto' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Marcar la hoja 1/i }))
    expect(screen.queryByRole('button', { name: 'Texto' })).not.toBeInTheDocument()
  })

  it('no muestra barra de hojas ni herramientas de edición al rellenar planillas', async () => {
    const user = userEvent.setup()
    mocks.listSavedDocs.mockResolvedValueOnce([
      { id: 'tpl-1', name: 'Ingreso paciente', doc: templateDoc(), savedAt: 1000 },
    ])
    renderWithProviders(<PdfStudioView studioMode="templates" />)

    await user.click(
      await screen.findByRole('button', {
        name: /Rellenar planilla Ingreso paciente/i,
      }),
    )
    await screen.findByRole('dialog', { name: /Rellenar planilla/i })

    expect(screen.getAllByText(/Rellenar e imprimir/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Imprimir planilla/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Importar PDF o imagen/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Guardar PDF/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Guardar planilla/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Campos' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('toolbar', { name: /Barra de hojas/i }),
    ).not.toBeInTheDocument()
  })

  it('exporta una planilla guardada como paquete de variables JSON y CSV', async () => {
    const user = userEvent.setup()
    mocks.listSavedDocs.mockResolvedValueOnce([
      { id: 'tpl-1', name: 'Ingreso paciente', doc: templateDoc(), savedAt: 1000 },
    ])
    renderWithProviders(<PdfStudioView studioMode="templates" />)

    // Exportar variables vive en el menú "..." de la tarjeta de planilla.
    const openMenu = async () =>
      user.click(
        await screen.findByRole('button', {
          name: /Más acciones de Ingreso paciente/i,
        }),
      )

    await openMenu()
    await user.click(screen.getByRole('menuitem', { name: /Exportar JSON/i }))
    expect(mocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'ingreso-paciente-variables.json',
    )

    await openMenu()
    await user.click(screen.getByRole('menuitem', { name: /Exportar CSV/i }))
    expect(mocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'ingreso-paciente-variables.csv',
    )
  })

  it('Guardar PDF exporta TODO; "Exportar" exporta sólo las marcadas', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile()) // 2 páginas
    await screen.findByAltText('Página 1')

    // "Guardar PDF" ensambla el documento completo y abre la vista previa.
    await user.click(screen.getByRole('button', { name: /^Guardar PDF$/i }))
    const preview = await screen.findByRole('dialog', { name: /Vista previa del PDF/i })
    expect(mocks.assemblePdfInWorker).toHaveBeenCalledTimes(1)
    expect(mocks.assemblePdfInWorker.mock.calls[0]![0].pages).toHaveLength(2)
    // Cerrar la vista previa para volver a la grilla.
    await user.click(
      within(preview).getByRole('button', { name: /Cerrar vista previa/i }),
    )

    // Marco 1 hoja → "Exportar" (barra) exporta SÓLO esa (descarga directa).
    await user.click(screen.getByRole('button', { name: /Marcar la hoja 1/i }))
    await user.click(screen.getByRole('button', { name: /^Exportar$/i }))
    expect(mocks.assemblePdfInWorker).toHaveBeenCalledTimes(2)
    expect(mocks.assemblePdfInWorker.mock.calls[1]![0].pages).toHaveLength(1)
  })

  it('muestra progreso accesible mientras arma el PDF', async () => {
    const user = userEvent.setup()
    let resolveAssemble!: (value: { blob: Blob; skipped: [] }) => void
    mocks.assemblePdfInWorker.mockReturnValue(
      new Promise((resolve) => {
        resolveAssemble = resolve
      }),
    )
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    await user.click(screen.getByRole('button', { name: /^Guardar PDF$/i }))

    expect(screen.getByRole('status')).toHaveTextContent('Preparando 2 páginas…')
    expect(
      screen.getByRole('button', { name: 'Cancelar exportación' }),
    ).toBeInTheDocument()
    const options = mocks.assemblePdfInWorker.mock.calls[0]![1] as {
      compression: 'balanced'
      onProgress: (event: {
        phase: 'process-pages'
        status: 'progress'
        current: number
        total: number
      }) => void
      signal: AbortSignal
    }
    expect(options.compression).toBe('balanced')
    expect(options.signal).toBeInstanceOf(AbortSignal)
    await user.click(screen.getByRole('button', { name: 'Cancelar exportación' }))
    expect(options.signal.aborted).toBe(true)
    act(() => {
      options.onProgress({
        phase: 'process-pages',
        status: 'progress',
        current: 1,
        total: 2,
      })
    })
    expect(screen.getByRole('status')).toHaveTextContent('Procesando páginas 1/2…')
    resolveAssemble({ blob: new Blob(['pdf'], { type: 'application/pdf' }), skipped: [] })
    expect(await screen.findByRole('button', { name: /^Guardar PDF$/i })).toBeEnabled()
  })

  it('doble clic en la miniatura abre el modal de ver/editar', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    const thumb = await screen.findByAltText('Página 1')

    await user.dblClick(thumb)
    expect(
      await screen.findByRole('dialog', { name: /Editar página 1/i }),
    ).toBeInTheDocument()
  })

  it('arrastra las páginas marcadas como bloque al soltar una miniatura seleccionada', async () => {
    const user = userEvent.setup()
    mocks.getPdfPageCount.mockResolvedValueOnce(4)
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 4')

    await user.click(screen.getByRole('button', { name: /Marcar la hoja 2/i }))
    await user.click(screen.getByRole('button', { name: /Marcar la hoja 3/i }))

    const cards = () =>
      screen.getAllByRole('listitem').filter((item) => item.getAttribute('data-page-id'))
    const idsBefore = cards().map((item) => item.getAttribute('data-page-id'))
    const selectedCard = cards()[1]!
    const dropTarget = cards()[3]!

    fireEvent.dragStart(selectedCard, { dataTransfer: { effectAllowed: 'move' } })
    fireEvent.dragEnter(dropTarget)
    fireEvent.drop(dropTarget)

    expect(cards().map((item) => item.getAttribute('data-page-id'))).toEqual([
      idsBefore[0],
      idsBefore[3],
      idsBefore[1],
      idsBefore[2],
    ])
  })

  it('la barra del editor agrupa las herramientas de estilo en el menú Texto', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await user.dblClick(await screen.findByAltText('Página 1'))
    await screen.findByRole('dialog', { name: /Editar página 1/i })

    // El estilo (fuente/tamaño/negrita/color/…) vive detrás de un solo menú "Texto".
    await user.click(screen.getByRole('button', { name: 'Texto' }))
    expect(screen.getByRole('button', { name: 'Negrita' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Color Tinta' })).toBeInTheDocument()
    // …y NO está el viejo texto instructivo.
    expect(screen.queryByText(/toca uno para editarlo/i)).not.toBeInTheDocument()
  })

  it('navega entre páginas del documento desde el mismo visor', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile()) // getPdfPageCount mock = 2 → 2 páginas
    await screen.findByAltText('Página 1')

    await user.dblClick(screen.getByAltText('Página 1'))
    const dialog = await screen.findByRole('dialog', { name: /Editar página 1/i })

    // En la primera: "anterior" deshabilitada, "siguiente" habilitada.
    expect(
      within(dialog).getByRole('button', { name: /Página anterior/i }),
    ).toBeDisabled()
    const next = within(dialog).getByRole('button', { name: /Página siguiente/i })
    expect(next).toBeEnabled()

    // Avanza → ahora el diálogo es la página 2.
    await user.click(next)
    expect(screen.getByRole('dialog', { name: /Editar página 2/i })).toBeInTheDocument()
  })

  it('elimina las páginas marcadas con la tecla Suprimir', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')

    await user.click(screen.getByRole('button', { name: /Marcar la hoja 1/i }))
    await user.click(screen.getByRole('button', { name: /Marcar la hoja 2/i }))
    await user.keyboard('{Delete}')

    expect(screen.getByText(/Trae un PDF o unas imágenes/)).toBeInTheDocument()
    expect(screen.queryByAltText('Página 1')).not.toBeInTheDocument()
  })

  it('copia y pega una página marcada con ⌘C/⌘V (2 → 3)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PdfStudioView />)
    await user.upload(fileInput(), pdfFile())
    await screen.findByAltText('Página 1')
    expect(screen.getByText(/2 páginas/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Marcar la hoja 1/i }))
    await user.keyboard('{Meta>}c{/Meta}')
    await user.keyboard('{Meta>}v{/Meta}')

    expect(screen.getByText(/3 páginas/)).toBeInTheDocument()
  })
})
