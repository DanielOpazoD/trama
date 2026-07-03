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
    onApplyPreset: vi.fn(),
    onApplyStyle: vi.fn(),
    onApplyVisual: vi.fn(),
    onDelete: vi.fn(),
    onDistributeFields: vi.fn(),
    onDuplicateFields: vi.fn(),
    onMatchFieldSizes: vi.fn(),
    onNavigate: vi.fn(),
    onPatchSelection: vi.fn(),
    onRememberStyle: vi.fn(),
    onRename: vi.fn(),
    onValueChange: vi.fn(),
  }
  render(<FormFieldInspector fields={fields} {...handlers} {...overrides} />)
  return handlers
}

describe('<FormFieldInspector />', () => {
  it('permite renombrar la variable; los flags viven explicados en Avanzado', () => {
    const handlers = renderInspector()

    fireEvent.change(screen.getByLabelText('Nombre del casillero'), {
      target: { value: 'diagnostico' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Avanzado' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Requerido/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Solo lectura/ }))

    expect(handlers.onRename).toHaveBeenCalledWith('diagnostico')
    expect(handlers.onPatchSelection).toHaveBeenCalledWith({ required: true })
    expect(handlers.onPatchSelection).toHaveBeenCalledWith({ readOnly: true })
    // Las explicaciones existen para que los flags se entiendan.
    expect(screen.getByText(/imprimir avisa si este casillero queda vacío/)).toBeVisible()
  })

  it('permite eliminar y navegar al casillero anterior/siguiente', () => {
    const handlers = renderInspector()

    fireEvent.click(screen.getByRole('button', { name: 'Casillero siguiente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Casillero anterior' }))
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar casillero' }))

    expect(handlers.onNavigate).toHaveBeenCalledWith(1)
    expect(handlers.onNavigate).toHaveBeenCalledWith(-1)
    expect(handlers.onDelete).toHaveBeenCalledOnce()
  })

  it('los colores viven plegados: se despliegan al apretar y aplican el patch', () => {
    const handlers = renderInspector()

    // Cerrados por defecto: ninguna paleta visible.
    expect(screen.queryByRole('button', { name: 'Fondo Amarillo' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Color de texto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Color de texto Rojo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fondo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fondo Amarillo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sin fondo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Borde' }))
    fireEvent.click(screen.getByRole('button', { name: 'Borde Tinta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Centrar texto' }))

    expect(handlers.onApplyVisual).toHaveBeenCalledWith({ color: '#b3412c' })
    expect(handlers.onApplyVisual).toHaveBeenCalledWith({ bgColor: '#f2c94c' })
    expect(handlers.onApplyVisual).toHaveBeenCalledWith({ bgColor: null })
    expect(handlers.onApplyVisual).toHaveBeenCalledWith({ borderColor: '#222222' })
    expect(handlers.onApplyVisual).toHaveBeenCalledWith({ align: 'center' })
    // Abrir Fondo cierra Color de texto (acordeón de apertura única).
    expect(screen.queryByRole('button', { name: 'Color de texto Azul' })).toBeNull()
  })

  it('el tamaño va de 1 en 1 pt y acepta un valor exacto escrito', () => {
    const handlers = renderInspector()
    // sizeRatio 0.04 sobre 792pt ≈ 32pt.
    const input = screen.getByRole('spinbutton', { name: 'Tamaño de letra en puntos' })
    expect(input).toHaveValue(32)

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar tamaño de letra' }))
    expect(handlers.onApplyStyle).toHaveBeenCalledWith({ sizeRatio: 33 / 792 })

    fireEvent.click(screen.getByRole('button', { name: 'Reducir tamaño de letra' }))
    expect(handlers.onApplyStyle).toHaveBeenCalledWith({ sizeRatio: 31 / 792 })

    fireEvent.change(input, { target: { value: '14' } })
    expect(handlers.onApplyStyle).toHaveBeenCalledWith({ sizeRatio: 14 / 792 })

    fireEvent.click(screen.getByRole('button', { name: 'Negrita' }))
    expect(handlers.onApplyStyle).toHaveBeenCalledWith({ bold: true })
  })

  it('los presets viven detrás de un desplegable y entregan los 4', () => {
    const handlers = renderInspector()

    expect(screen.queryByRole('button', { name: /Preset Firma/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Presets' }))

    for (const preset of ['Limpio', 'Formulario', 'Firma', 'Destacado']) {
      expect(
        screen.getByRole('button', { name: new RegExp(`Preset ${preset}`) }),
      ).toBeVisible()
    }
    fireEvent.click(screen.getByRole('button', { name: /Preset Firma/ }))
    expect(handlers.onApplyPreset).toHaveBeenCalledWith('firma')
  })

  it('ofrece fijar el estilo de nuevos casilleros con su explicación de tamaño', () => {
    const handlers = renderInspector()

    fireEvent.click(screen.getByRole('button', { name: 'Avanzado' }))
    expect(screen.getByText(/mismo tamaño de cuadro, letra y estilo/)).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Usar como estilo de nuevos casilleros' }),
    )

    expect(handlers.onRememberStyle).toHaveBeenCalledOnce()
  })

  it('con selección múltiple muestra orden y oculta variable/valor y navegación', () => {
    const handlers = renderInspector([field, second, third])

    expect(screen.getByText('3 casilleros', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre del casillero')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Casillero siguiente' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Alinear casilleros al centro' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Distribuir casilleros horizontalmente' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fondo' }))
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
