import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makePdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
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
const second = { ...field, id: 'f-2', name: 'rut', xRatio: 0.5 }
const third = { ...field, id: 'f-3', name: 'fecha', yRatio: 0.6 }

function renderInspector(
  fields = [field],
  overrides: Partial<Parameters<typeof FormFieldInspector>[0]> = {},
) {
  const handlers = {
    onAlignFields: vi.fn(),
    onApplyStyle: vi.fn(),
    onApplyVisual: vi.fn(),
    onDelete: vi.fn(),
    onDistributeFields: vi.fn(),
    onDuplicateFields: vi.fn(),
    onMatchFieldSizes: vi.fn(),
    onPatchSelection: vi.fn(),
    onRememberStyle: vi.fn(),
    onRename: vi.fn(),
    onValueChange: vi.fn(),
  }
  render(<FormFieldInspector fields={fields} {...handlers} {...overrides} />)
  return handlers
}

describe('<FormFieldInspector />', () => {
  it('permite renombrar la variable y cambiar flags del casillero', () => {
    const handlers = renderInspector()

    fireEvent.change(screen.getByLabelText('Nombre del casillero'), {
      target: { value: 'diagnostico' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Requerido' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Solo lectura' }))

    expect(handlers.onRename).toHaveBeenCalledWith('diagnostico')
    expect(handlers.onPatchSelection).toHaveBeenCalledWith({ required: true })
    expect(handlers.onPatchSelection).toHaveBeenCalledWith({ readOnly: true })
  })

  it('permite eliminar el casillero seleccionado', () => {
    const handlers = renderInspector()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar casillero' }))

    expect(handlers.onDelete).toHaveBeenCalledOnce()
  })

  it('aplica estilo visual: color, fondo, borde, alineación y limpieza', () => {
    const handlers = renderInspector()

    fireEvent.click(screen.getByRole('button', { name: 'Color de texto Rojo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fondo Amarillo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sin fondo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Borde Tinta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Centrar texto' }))

    expect(handlers.onApplyVisual).toHaveBeenCalledWith({ color: '#b3412c' })
    expect(handlers.onApplyVisual).toHaveBeenCalledWith({ bgColor: '#f2c94c' })
    expect(handlers.onApplyVisual).toHaveBeenCalledWith({ bgColor: null })
    expect(handlers.onApplyVisual).toHaveBeenCalledWith({ borderColor: '#222222' })
    expect(handlers.onApplyVisual).toHaveBeenCalledWith({ align: 'center' })
  })

  it('ajusta tamaño y negrita de la selección', () => {
    const handlers = renderInspector()

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar tamaño de letra' }))
    fireEvent.click(screen.getByRole('button', { name: 'Negrita' }))

    expect(handlers.onApplyStyle).toHaveBeenCalledWith({ sizeRatio: 0.045 })
    expect(handlers.onApplyStyle).toHaveBeenCalledWith({ bold: true })
  })

  it('ofrece fijar el estilo como inicial para nuevos casilleros de texto', () => {
    const handlers = renderInspector()

    fireEvent.click(
      screen.getByRole('button', { name: 'Usar como estilo de nuevos casilleros' }),
    )

    expect(handlers.onRememberStyle).toHaveBeenCalledOnce()
  })

  it('con selección múltiple muestra orden y oculta variable/valor', () => {
    const handlers = renderInspector([field, second, third])

    expect(screen.getByText('3 casilleros', { selector: 'p' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Eliminar 3 casilleros' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre del casillero')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Valor inicial del casillero')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Alinear casilleros al centro' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Distribuir casilleros horizontalmente' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fondo Papel' }))

    expect(handlers.onAlignFields).toHaveBeenCalledWith('center')
    expect(handlers.onDistributeFields).toHaveBeenCalledWith('x')
    expect(handlers.onApplyVisual).toHaveBeenCalledWith({ bgColor: '#ffffff' })
  })

  it('con dos casilleros no ofrece distribuir (requiere tres)', () => {
    renderInspector([field, second])

    expect(
      screen.queryByRole('button', { name: 'Distribuir casilleros horizontalmente' }),
    ).not.toBeInTheDocument()
  })

  it('alinea verticalmente, iguala tamaños y duplica la selección', () => {
    const handlers = renderInspector([field, second])

    fireEvent.click(screen.getByRole('button', { name: 'Alinear casilleros arriba' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alinear casilleros al medio' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alinear casilleros abajo' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Igualar ancho de casilleros al activo' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Igualar alto de casilleros al activo' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Duplicar casilleros seleccionados' }),
    )

    expect(handlers.onAlignFields).toHaveBeenCalledWith('top')
    expect(handlers.onAlignFields).toHaveBeenCalledWith('middle')
    expect(handlers.onAlignFields).toHaveBeenCalledWith('bottom')
    expect(handlers.onMatchFieldSizes).toHaveBeenCalledWith('width')
    expect(handlers.onMatchFieldSizes).toHaveBeenCalledWith('height')
    expect(handlers.onDuplicateFields).toHaveBeenCalledOnce()
  })
})
