import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyDoc } from '../../../../lib/pdfStudio/model/model'
import type { SavedDoc } from '../../../../lib/pdfStudio/render/persistence'
import { WorkspaceTemplateDetails } from './WorkspaceTemplateDetails'

const saved: SavedDoc = {
  id: 't1',
  name: 'Ingreso',
  doc: emptyDoc(),
  savedAt: 1,
  kind: 'template',
  description: 'Ficha de ingreso',
  tags: ['medif'],
}

describe('<WorkspaceTemplateDetails />', () => {
  it('muestra descripción y tags cuando no se edita; nada si no hay metadatos', () => {
    const { rerender } = render(
      <WorkspaceTemplateDetails
        saved={saved}
        editing={false}
        onCloseEdit={vi.fn()}
        onUpdateMeta={vi.fn()}
      />,
    )
    expect(screen.getByText('Ficha de ingreso')).toBeInTheDocument()
    expect(screen.getByText('#medif')).toBeInTheDocument()

    rerender(
      <WorkspaceTemplateDetails
        saved={{ ...saved, description: undefined, tags: undefined }}
        editing={false}
        onCloseEdit={vi.fn()}
        onUpdateMeta={vi.fn()}
      />,
    )
    expect(screen.queryByText('Ficha de ingreso')).not.toBeInTheDocument()
  })

  it('edita descripción, tags y estado, y guarda el patch normalizado', () => {
    const onUpdateMeta = vi.fn()
    const onCloseEdit = vi.fn()
    render(
      <WorkspaceTemplateDetails
        saved={saved}
        editing
        onCloseEdit={onCloseEdit}
        onUpdateMeta={onUpdateMeta}
      />,
    )

    fireEvent.change(screen.getByLabelText('Descripción de la plantilla'), {
      target: { value: '  Ficha completa de ingreso  ' },
    })
    fireEvent.change(screen.getByLabelText('Tags de la plantilla (separadas por coma)'), {
      target: { value: 'medif, #ingreso, medif' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Borrador' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar detalles de Ingreso' }))

    expect(onUpdateMeta).toHaveBeenCalledWith({
      description: 'Ficha completa de ingreso',
      tags: ['medif', 'ingreso'],
      status: 'draft',
    })
    expect(onCloseEdit).toHaveBeenCalledOnce()
  })

  it('cancelar cierra sin guardar', () => {
    const onUpdateMeta = vi.fn()
    const onCloseEdit = vi.fn()
    render(
      <WorkspaceTemplateDetails
        saved={saved}
        editing
        onCloseEdit={onCloseEdit}
        onUpdateMeta={onUpdateMeta}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onUpdateMeta).not.toHaveBeenCalled()
    expect(onCloseEdit).toHaveBeenCalledOnce()
  })
})
