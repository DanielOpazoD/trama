import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  addPdfFormField,
  addPdfSource,
  emptyDoc,
  makePdfFormFieldDraft,
  type ImageAsset,
} from '../../../lib/pdfStudio/model'
import type { SavedDoc } from '../../../lib/pdfStudio/persistence'
import { WorkspacePanel } from './WorkspacePanel'

vi.mock('../../../lib/pdfStudio/pdfRender', () => ({
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
  const props = {
    library: [] as ImageAsset[],
    onAddImage: vi.fn(),
    onRemoveImage: vi.fn(),
    onDownloadImage: vi.fn(),
    saved,
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
    expect(
      screen.getByRole('button', { name: /Rellenar planilla Ingreso paciente/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Usar planilla')).toBeInTheDocument()
    expect(screen.getByText(/1 campo/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Abrir PDF suelto para editar/i }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Rellenar planilla Ingreso paciente/i }),
    )

    expect(props.onUseTemplate).toHaveBeenCalledWith(props.saved[0])
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

    fireEvent.click(
      screen.getByRole('button', { name: /Duplicar planilla Ingreso paciente/i }),
    )
    expect(props.onDuplicateSaved).toHaveBeenCalledWith(props.saved[0])

    fireEvent.click(
      screen.getByRole('button', {
        name: /Exportar variables JSON de planilla Ingreso paciente/i,
      }),
    )
    expect(props.onExportTemplatePackage).toHaveBeenCalledWith(props.saved[0], 'json')

    fireEvent.click(
      screen.getByRole('button', {
        name: /Exportar variables CSV de planilla Ingreso paciente/i,
      }),
    )
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
})
