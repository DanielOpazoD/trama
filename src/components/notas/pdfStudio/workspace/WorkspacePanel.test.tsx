import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  addPdfFormField,
  addPdfSource,
  emptyDoc,
  makePdfFormFieldDraft,
  type ImageAsset,
} from '../../../../lib/pdfStudio/model/model'
import type { SavedDoc, SavedFolder } from '../../../../lib/pdfStudio/render/persistence'
import { WorkspacePanel } from './WorkspacePanel'

vi.mock('../../../../lib/pdfStudio/render/pdfRender', () => ({
  renderPageThumb: vi.fn(async () => 'blob:template-thumb'),
}))

const pdf = () => new File(['%PDF'], 'base.pdf', { type: 'application/pdf' })

function templateDoc() {
  const doc = addPdfSource(emptyDoc(), pdf(), 1)
  return addPdfFormField(
    doc,
    makePdfFormFieldDraft({
      fieldKind: 'text',
      pageId: doc.pages[0]!.id,
      name: 'paciente',
      value: '',
      xRatio: 0.1,
      yRatio: 0.2,
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

function setup(overrides: Partial<Parameters<typeof WorkspacePanel>[0]> = {}) {
  const saved: SavedDoc[] = [
    { id: 'tpl-1', name: 'Ingreso paciente', doc: templateDoc(), savedAt: 1000 },
    {
      id: 'doc-1',
      name: 'PDF suelto',
      doc: addPdfSource(emptyDoc(), pdf(), 1),
      savedAt: 900,
    },
  ]
  const folders: SavedFolder[] = []
  const props = {
    library: [] as ImageAsset[],
    onAddImage: vi.fn(),
    onRemoveImage: vi.fn(),
    onDownloadImage: vi.fn(),
    saved,
    folders,
    canSave: true,
    canSaveTemplate: true,
    onSaveCreation: vi.fn(),
    onSaveTemplate: vi.fn(),
    onOpenSaved: vi.fn(),
    onUseTemplate: vi.fn(),
    onDuplicateSaved: vi.fn(),
    onRenameSaved: vi.fn(),
    onDeleteSaved: vi.fn(),
    onDownloadSaved: vi.fn(),
    onCreateFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onUpdateFolderColor: vi.fn(),
    onDeleteFolder: vi.fn(),
    onMoveSavedToFolder: vi.fn(),
    onExportTemplatePackage: vi.fn(),
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    ...overrides,
  }
  render(<WorkspacePanel {...props} />)
  return props
}

describe('<WorkspacePanel /> · planillas', () => {
  it('puede ocultar planillas cuando el módulo es sólo editor PDF', () => {
    setup({ templatesEnabled: false })

    expect(screen.queryByText('Planillas')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Rellenar planilla Ingreso paciente/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: /Editar estructura de planilla Ingreso paciente/i,
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Abrir PDF suelto para editar/i }),
    ).toBeInTheDocument()
  })

  it('separa planillas con campos especiales y permite usarlas limpias', () => {
    const props = setup()

    expect(screen.getByText('Planillas')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /Crear plantilla/i })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /Rellenar plantilla/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Rellenar planilla Ingreso paciente/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Rellenar planilla Ingreso paciente/i }),
    ).toHaveTextContent('Rellenar plantilla')
    expect(
      screen.getByRole('button', {
        name: /Editar estructura de planilla Ingreso paciente/i,
      }),
    ).toHaveTextContent('Editar plantilla')
    expect(screen.getByText(/1 campo/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Abrir PDF suelto para editar/i }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Rellenar planilla Ingreso paciente/i }),
    )

    expect(props.onUseTemplate).toHaveBeenCalledWith(props.saved[0])
  })

  it('separa copias con datos de las planillas reusables aunque tengan campos', () => {
    setup({
      saved: [
        {
          id: 'filled-1',
          name: 'Ingreso paciente datos',
          doc: filledTemplateDoc(),
          savedAt: 1200,
          kind: 'filled-template',
        },
        {
          id: 'tpl-1',
          name: 'Ingreso paciente',
          doc: templateDoc(),
          savedAt: 1000,
          kind: 'template',
        },
      ],
    })

    expect(
      screen.getByRole('button', { name: /Rellenar planilla Ingreso paciente$/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: /Rellenar planilla Ingreso paciente datos/i,
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: /Abrir copia con datos Ingreso paciente datos/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Copia con datos')).toBeInTheDocument()
    expect(screen.getByText('Abrir relleno')).toBeInTheDocument()
  })

  it('permite buscar planillas por nombre y deja la biblioteca escaneable', () => {
    setup({
      saved: [
        { id: 'tpl-1', name: 'Ingreso paciente', doc: templateDoc(), savedAt: 1000 },
        { id: 'tpl-2', name: 'Control HTA', doc: templateDoc(), savedAt: 2000 },
      ],
    })

    expect(
      screen.getByRole('searchbox', { name: /Buscar planillas/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Ingreso paciente')).toBeInTheDocument()
    expect(screen.getByText('Control HTA')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: /Buscar planillas/i }), {
      target: { value: 'hta' },
    })

    expect(screen.queryByText('Ingreso paciente')).not.toBeInTheDocument()
    expect(screen.getByText('Control HTA')).toBeInTheDocument()
  })

  it('expone acciones profesionales para duplicar y exportar variables de una planilla', () => {
    const props = setup()

    // Las acciones secundarias viven detrás del menú "..." (más compacto).
    const openMenu = () =>
      fireEvent.click(
        screen.getByRole('button', { name: /Más acciones de Ingreso paciente/i }),
      )

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Duplicar/i }))
    expect(props.onDuplicateSaved).toHaveBeenCalledWith(props.saved[0])

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Exportar JSON/i }))
    expect(props.onExportTemplatePackage).toHaveBeenCalledWith(props.saved[0], 'json')

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Exportar CSV/i }))
    expect(props.onExportTemplatePackage).toHaveBeenCalledWith(props.saved[0], 'csv')
  })

  it('permite editar la estructura de una planilla sin entrar al flujo de llenado', () => {
    const props = setup()

    fireEvent.click(
      screen.getByRole('button', {
        name: /Editar estructura de planilla Ingreso paciente/i,
      }),
    )

    expect(props.onOpenSaved).toHaveBeenCalledWith(props.saved[0])
    expect(props.onUseTemplate).not.toHaveBeenCalled()
  })

  it('ofrece guardar la creación actual como planilla cuando hay campos especiales', () => {
    const props = setup()

    fireEvent.click(screen.getByRole('button', { name: /Guardar planilla/i }))
    fireEvent.change(screen.getByPlaceholderText(/Nombre de la planilla/i), {
      target: { value: 'Control HTA' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar planilla' }))

    expect(props.onSaveTemplate).toHaveBeenCalledWith('Control HTA')
  })

  it('crea carpetas con nombre y color dentro de PDFs y copias', () => {
    const props = setup()

    fireEvent.click(screen.getByRole('button', { name: /Nueva carpeta/i }))
    fireEvent.change(screen.getByPlaceholderText(/Nombre de la carpeta/i), {
      target: { value: 'Protocolos' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Color azul/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }))

    expect(props.onCreateFolder).toHaveBeenCalledWith({
      name: 'Protocolos',
      color: 'blue',
    })
  })

  it('filtra por carpeta y permite volver a Todas', () => {
    setup({
      folders: [{ id: 'folder-1', name: 'Protocolos', color: 'blue', createdAt: 100 }],
      saved: [
        {
          id: 'doc-1',
          name: 'Consentimiento',
          doc: addPdfSource(emptyDoc(), pdf(), 1),
          savedAt: 1000,
          folderId: 'folder-1',
        },
        {
          id: 'doc-2',
          name: 'Alta',
          doc: addPdfSource(emptyDoc(), pdf(), 1),
          savedAt: 900,
        },
      ],
    })

    expect(screen.getByText('Consentimiento')).toBeInTheDocument()
    expect(screen.getByText('Alta')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Abrir carpeta Protocolos/i }))

    expect(screen.getByText('Consentimiento')).toBeInTheDocument()
    expect(screen.queryByText('Alta')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Mostrar todas las copias/i }))

    expect(screen.getByText('Consentimiento')).toBeInTheDocument()
    expect(screen.getByText('Alta')).toBeInTheDocument()
  })

  it('colapsa y despliega el contenido de una carpeta con un clic', () => {
    setup({
      folders: [{ id: 'folder-1', name: 'Protocolos', color: 'blue', createdAt: 100 }],
      saved: [
        {
          id: 'doc-1',
          name: 'Consentimiento',
          doc: addPdfSource(emptyDoc(), pdf(), 1),
          savedAt: 1000,
          folderId: 'folder-1',
        },
        {
          id: 'doc-2',
          name: 'Alta',
          doc: addPdfSource(emptyDoc(), pdf(), 1),
          savedAt: 900,
        },
      ],
    })

    const folder = screen.getByRole('button', { name: /Abrir carpeta Protocolos/i })

    expect(folder).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(folder)

    expect(folder).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Consentimiento')).toBeInTheDocument()
    expect(screen.queryByText('Alta')).not.toBeInTheDocument()

    fireEvent.click(folder)

    expect(folder).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Consentimiento')).toBeInTheDocument()
    expect(screen.getByText('Alta')).toBeInTheDocument()
  })

  it('arrastra una copia guardada hacia una carpeta con feedback visual', () => {
    const props = setup({
      folders: [{ id: 'folder-1', name: 'Protocolos', color: 'green', createdAt: 100 }],
      saved: [
        {
          id: 'doc-1',
          name: 'Consentimiento',
          doc: addPdfSource(emptyDoc(), pdf(), 1),
          savedAt: 1000,
        },
      ],
    })

    const dataTransfer = {
      data: {} as Record<string, string>,
      types: ['application/x-trama-saved-doc-id'],
      effectAllowed: '',
      dropEffect: '',
      setData(type: string, value: string) {
        this.data[type] = value
      },
      getData(type: string) {
        return this.data[type] ?? ''
      },
    }
    const row = screen.getByRole('listitem', { name: /Consentimiento/i })
    const folder = screen.getByRole('button', { name: /Abrir carpeta Protocolos/i })

    fireEvent.dragStart(row, { dataTransfer })
    fireEvent.dragEnter(folder, { dataTransfer })

    expect(folder).toHaveAttribute('data-drop-active', 'true')

    fireEvent.drop(folder, { dataTransfer })

    expect(props.onMoveSavedToFolder).toHaveBeenCalledWith('doc-1', 'folder-1')
  })

  it('oculta el selector de carpeta y deja las acciones de archivo detrás de menú', () => {
    const props = setup({
      folders: [{ id: 'folder-1', name: 'Protocolos', color: 'green', createdAt: 100 }],
      saved: [
        {
          id: 'doc-1',
          name: 'Consentimiento',
          doc: addPdfSource(emptyDoc(), pdf(), 1),
          savedAt: 1000,
        },
      ],
    })

    expect(
      screen.queryByLabelText(/Mover Consentimiento a carpeta/i),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Más acciones de Consentimiento/i }),
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Descargar/i }))
    expect(props.onDownloadSaved).toHaveBeenCalledWith(props.saved[0])

    fireEvent.click(
      screen.getByRole('button', { name: /Más acciones de Consentimiento/i }),
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Mover a Protocolos/i }))
    expect(props.onMoveSavedToFolder).toHaveBeenCalledWith('doc-1', 'folder-1')

    fireEvent.click(
      screen.getByRole('button', { name: /Más acciones de Consentimiento/i }),
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Eliminar/i }))
    expect(props.onDeleteSaved).toHaveBeenCalledWith('doc-1')
  })

  it('permite administrar una carpeta sin borrar sus documentos', () => {
    const props = setup({
      folders: [{ id: 'folder-1', name: 'Protocolos', color: 'green', createdAt: 100 }],
      saved: [
        {
          id: 'doc-1',
          name: 'Consentimiento',
          doc: addPdfSource(emptyDoc(), pdf(), 1),
          savedAt: 1000,
          folderId: 'folder-1',
        },
      ],
    })

    fireEvent.click(
      screen.getByRole('button', { name: /Más acciones de carpeta Protocolos/i }),
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Cambiar a naranja/i }))
    expect(props.onUpdateFolderColor).toHaveBeenCalledWith('folder-1', 'orange')

    fireEvent.click(
      screen.getByRole('button', { name: /Más acciones de carpeta Protocolos/i }),
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Renombrar/i }))
    fireEvent.change(screen.getByPlaceholderText(/Nombre de la carpeta/i), {
      target: { value: 'Protocolos 2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Guardar nombre de carpeta/i }))
    expect(props.onRenameFolder).toHaveBeenCalledWith('folder-1', 'Protocolos 2026')

    fireEvent.click(
      screen.getByRole('button', { name: /Más acciones de carpeta Protocolos/i }),
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Eliminar carpeta/i }))
    expect(props.onDeleteFolder).toHaveBeenCalledWith('folder-1')
    expect(props.onDeleteSaved).not.toHaveBeenCalled()
  })

  it('muestra una cabecera editorial al abrir una carpeta', () => {
    setup({
      folders: [{ id: 'folder-1', name: 'Protocolos', color: 'orange', createdAt: 100 }],
      saved: [
        {
          id: 'doc-1',
          name: 'Consentimiento',
          doc: addPdfSource(emptyDoc(), pdf(), 1),
          savedAt: new Date('2026-06-11T10:30:00').getTime(),
          folderId: 'folder-1',
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: /Abrir carpeta Protocolos/i }))

    const header = screen.getByRole('group', { name: /Carpeta Protocolos/i })
    expect(header).toHaveTextContent('Protocolos')
    expect(header).toHaveTextContent('1 documento')
    expect(header).toHaveTextContent(/Última actualización/i)
  })

  it('busca y ordena PDFs y copias dentro del archivo', () => {
    setup({
      saved: [
        {
          id: 'doc-1',
          name: 'Zeta alta',
          doc: addPdfSource(emptyDoc(), pdf(), 1),
          savedAt: 1000,
        },
        {
          id: 'doc-2',
          name: 'Anexo gastro',
          doc: addPdfSource(emptyDoc(), pdf(), 1),
          savedAt: 2000,
        },
      ],
    })

    fireEvent.change(screen.getByRole('searchbox', { name: /Buscar PDFs y copias/i }), {
      target: { value: 'gastro' },
    })

    expect(screen.getByText('Anexo gastro')).toBeInTheDocument()
    expect(screen.queryByText('Zeta alta')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: /Buscar PDFs y copias/i }), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: /Ordenar PDFs y copias/i }), {
      target: { value: 'name' },
    })

    const items = screen.getAllByRole('listitem').map((item) => item.textContent ?? '')
    expect(items[0]).toContain('Anexo gastro')
    expect(items[1]).toContain('Zeta alta')
  })

  it('muestra chips discretos de carpeta y confirma el movimiento', () => {
    const props = setup({
      folders: [{ id: 'folder-1', name: 'Protocolos', color: 'green', createdAt: 100 }],
      saved: [
        {
          id: 'doc-1',
          name: 'Consentimiento',
          doc: addPdfSource(emptyDoc(), pdf(), 1),
          savedAt: 1000,
          folderId: 'folder-1',
        },
      ],
    })

    expect(
      within(screen.getByRole('listitem', { name: /Consentimiento/i })).getByText(
        'Protocolos',
      ),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Más acciones de Consentimiento/i }),
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Sacar de carpeta/i }))

    expect(props.onMoveSavedToFolder).toHaveBeenCalledWith('doc-1', null)
    expect(screen.getByRole('status')).toHaveTextContent('Movido a Todas')
  })
})
