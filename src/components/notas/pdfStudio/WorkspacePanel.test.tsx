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
    onRenameSaved: vi.fn(),
    onDeleteSaved: vi.fn(),
    onDownloadSaved: vi.fn(),
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    ...overrides,
  }
  render(<WorkspacePanel {...props} />)
  return props
}

describe('<WorkspacePanel /> · planillas', () => {
  it('separa planillas con campos especiales y permite usarlas limpias', () => {
    const props = setup()

    expect(screen.getByText('Planillas')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Usar planilla Ingreso paciente/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/1 campo/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Abrir PDF suelto para editar/i }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Usar planilla Ingreso paciente/i }),
    )

    expect(props.onUseTemplate).toHaveBeenCalledWith(props.saved[0])
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
