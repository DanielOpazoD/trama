import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makePdfFormFieldDraft } from '../../../lib/pdfStudio/model/model'
import { FormFieldInspector } from './FormFieldInspector'

const field = makePdfFormFieldDraft({
  fieldKind: 'text',
  pageId: 'p1',
  name: 'paciente',
  value: '',
  xRatio: 0.1,
  yRatio: 0.2,
  wRatio: 0.3,
  hRatio: 0.05,
})

describe('<FormFieldInspector />', () => {
  it('permite renombrar variables de planilla y cambiar flags del casillero', () => {
    const onPatch = vi.fn()
    render(
      <FormFieldInspector
        field={field}
        onDelete={vi.fn()}
        onPatch={onPatch}
        onValueChange={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Nombre del casillero'), {
      target: { value: 'diagnostico' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Requerido' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Solo lectura' }))

    expect(onPatch).toHaveBeenCalledWith({ name: 'diagnostico' })
    expect(onPatch).toHaveBeenCalledWith({ required: true })
    expect(onPatch).toHaveBeenCalledWith({ readOnly: true })
  })

  it('permite eliminar el casillero seleccionado', () => {
    const onDelete = vi.fn()
    render(
      <FormFieldInspector
        field={field}
        onDelete={onDelete}
        onPatch={vi.fn()}
        onValueChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar casillero' }))

    expect(onDelete).toHaveBeenCalledOnce()
  })
})
