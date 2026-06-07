import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditorToolbar } from './EditorToolbar'
import { type TextStyle } from './editorStyle'

type Props = Parameters<typeof EditorToolbar>[0]

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    tool: 'select',
    onToolChange: vi.fn(),
    onAddText: vi.fn(),
    onAddImage: vi.fn(),
    activeFont: 'sans',
    activeSize: 0.04,
    activeBold: false,
    activeColor: '#222222',
    activeOpacity: 1,
    activeRotation: 0,
    onApplyStyle: vi.fn(),
    hasDuplicableSelection: false,
    onDuplicate: vi.fn(),
    hasSelection: false,
    onDelete: vi.fn(),
    zoom: 1.5,
    onZoomChange: vi.fn(),
    ...overrides,
  }
  render(<EditorToolbar {...props} />)
  return props
}

/** Último patch pasado a onApplyStyle. */
const lastStyle = (fn: Props['onApplyStyle']): Partial<TextStyle> => {
  const calls = vi.mocked(fn).mock.calls
  return calls[calls.length - 1]![0]
}

describe('<EditorToolbar />', () => {
  it('se presenta como una barra profesional con zonas de edición', () => {
    setup({ hasDuplicableSelection: true, hasSelection: true })

    const toolbar = screen.getByRole('toolbar', {
      name: /barra de herramientas de edición del pdf/i,
    })
    expect(toolbar).toHaveClass('flex-nowrap')
    expect(toolbar).not.toHaveClass('flex-wrap')
    expect(
      screen.getByRole('toolbar', { name: /barra de herramientas de edición del pdf/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Herramientas' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Insertar' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Estilo' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Objeto' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Vista' })).toBeInTheDocument()
  })

  it('prioriza agregar texto y seleccionar como acciones visibles de primera fila', () => {
    setup()

    const tools = screen.getByRole('group', { name: 'Herramientas' })
    expect(tools).toContainElement(
      screen.getByRole('button', { name: /Agregar cuadro de texto/i }),
    )
    expect(tools).toContainElement(screen.getByLabelText('Herramienta seleccionar'))
    expect(screen.queryByLabelText('Herramienta resaltar')).not.toBeInTheDocument()
  })

  it('en modo planilla prioriza crear casillero y no texto PDF normal', () => {
    const p = setup({
      context: 'templateDesign',
      onAddFormField: vi.fn(),
      onInspectForms: vi.fn(),
      onSuggestFormFields: vi.fn(),
    })

    fireEvent.click(screen.getByRole('button', { name: /Crear casillero de texto/i }))

    expect(p.onAddFormField).toHaveBeenCalledWith('text')
    expect(p.onAddText).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('button', { name: /Agregar cuadro de texto/i }),
    ).not.toBeInTheDocument()
  })

  it('evita bordes anidados en los grupos principales', () => {
    setup({ hasDuplicableSelection: true, hasSelection: true })
    for (const label of ['Herramientas', 'Insertar', 'Estilo', 'Objeto', 'Vista']) {
      expect(screen.getByRole('group', { name: label }).className).not.toMatch(
        /\bborder\b/,
      )
    }
  })

  it('agrupa fuente, formas, colores y funciones raras en menús compactos', () => {
    const p = setup({ hasDuplicableSelection: true, hasSelection: true })

    expect(screen.queryByRole('button', { name: 'Fuente Serif' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Color Amarillo' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('Rotación del texto: aumentar'),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Fuente' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Fuente Serif' }))
    expect(lastStyle(p.onApplyStyle)).toEqual({ font: 'serif' })

    fireEvent.click(screen.getByRole('button', { name: 'Formas' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Herramienta Rectángulo' }))
    expect(p.onToolChange).toHaveBeenCalledWith('rect')

    fireEvent.click(screen.getByRole('button', { name: 'Color' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Color Amarillo' }))
    expect(lastStyle(p.onApplyStyle)).toEqual({ color: '#f2c94c' })

    fireEvent.click(screen.getByRole('button', { name: 'Más funciones' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Herramienta Resaltar' }))
    expect(p.onToolChange).toHaveBeenCalledWith('highlight')
    fireEvent.click(screen.getByRole('button', { name: 'Más funciones' }))
    fireEvent.click(screen.getByLabelText('Rotación del texto: aumentar'))
    expect(lastStyle(p.onApplyStyle)).toEqual({ rotation: 15 })
  })

  it('deja el menú Campos limitado a casilleros de texto en planillas v1', () => {
    const p = setup({
      onAddFormField: vi.fn(),
      onInspectForms: vi.fn(),
      onSuggestFormFields: vi.fn(),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Campos' }))

    expect(
      screen.getByRole('menuitem', { name: 'Detectar campos del PDF' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: 'Sugerir casilleros vacíos' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: 'Crear casillero de texto' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Crear campo Firma' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Crear campo Fecha' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Crear campo Checkbox' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Crear campo Radio' })).toBeNull()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Sugerir casilleros vacíos' }))
    expect(p.onSuggestFormFields).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Campos' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Crear casillero de texto' }))
    expect(p.onAddFormField).toHaveBeenCalledWith('text')
  })

  it('abre todos sus menús por delante del modal del editor PDF', () => {
    setup({ hasDuplicableSelection: true, hasSelection: true })

    fireEvent.click(screen.getByRole('button', { name: 'Fuente' }))
    expect(screen.getByRole('menu')).toHaveClass('z-[80]')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Fuente Serif' }))

    fireEvent.click(screen.getByRole('button', { name: 'Formas' }))
    expect(screen.getByRole('menu')).toHaveClass('z-[80]')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Herramienta Rectángulo' }))

    fireEvent.click(screen.getByRole('button', { name: 'Color' }))
    expect(screen.getByRole('menu')).toHaveClass('z-[80]')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Color Amarillo' }))

    fireEvent.click(screen.getByRole('button', { name: 'Más funciones' }))
    expect(screen.getByRole('menu')).toHaveClass('z-[80]')
  })

  it('agrega texto y cambia de herramienta', () => {
    const p = setup()
    const addText = screen.getByRole('button', { name: /Agregar cuadro de texto/i })
    expect(addText.textContent).toBe('')
    fireEvent.click(addText)
    expect(p.onAddText).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByLabelText('Herramienta redactar'))
    expect(p.onToolChange).toHaveBeenCalledWith('redact')
  })

  it('agrega una imagen estampada desde la barra', () => {
    const p = setup()
    fireEvent.click(screen.getByRole('button', { name: /Estampar imagen/i }))
    expect(p.onAddImage).toHaveBeenCalledOnce()
  })

  it('aplica fuente, negrita y color por onApplyStyle', () => {
    const p = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Fuente' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Fuente Serif' }))
    expect(lastStyle(p.onApplyStyle)).toEqual({ font: 'serif' })
    fireEvent.click(screen.getByLabelText('Negrita'))
    expect(lastStyle(p.onApplyStyle)).toEqual({ bold: true })
    fireEvent.click(screen.getByRole('button', { name: 'Color' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Color Rojo' }))
    expect(lastStyle(p.onApplyStyle)).toEqual({ color: '#b3412c' })
  })

  it('el stepper de tamaño aplica un sizeRatio mayor', () => {
    const p = setup({ activeSize: 0.04 })
    fireEvent.click(screen.getByLabelText('Tamaño de letra: aumentar'))
    expect(lastStyle(p.onApplyStyle).sizeRatio).toBeGreaterThan(0.04)
  })

  it('deshabilita aumentar tamaño en el máximo', () => {
    setup({ activeSize: 0.14 })
    expect(screen.getByLabelText('Tamaño de letra: aumentar')).toBeDisabled()
  })

  it('el zoom sube de 10% en 10% y permite escribir un porcentaje manual', () => {
    const p = setup({ zoom: 1.5 })
    fireEvent.click(screen.getByLabelText('Zoom del documento: aumentar'))
    expect(p.onZoomChange).toHaveBeenLastCalledWith(1.6)

    const input = screen.getByLabelText('Porcentaje de zoom')
    fireEvent.change(input, { target: { value: '125' } })
    fireEvent.blur(input)
    expect(p.onZoomChange).toHaveBeenLastCalledWith(1.25)
  })

  it('mantiene Duplicar/Eliminar visibles pero deshabilitados cuando no hay selección', () => {
    setup({ hasDuplicableSelection: false, hasSelection: false })
    expect(screen.getByLabelText('Duplicar texto')).toBeDisabled()
    expect(screen.getByLabelText('Eliminar')).toBeDisabled()
  })

  it('Duplicar (texto) y Eliminar (cualquier selección) disparan sus handlers', () => {
    const p = setup({ hasDuplicableSelection: true, hasSelection: true })
    fireEvent.click(screen.getByLabelText('Duplicar texto'))
    expect(p.onDuplicate).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByLabelText('Eliminar'))
    expect(p.onDelete).toHaveBeenCalledOnce()
  })
})
