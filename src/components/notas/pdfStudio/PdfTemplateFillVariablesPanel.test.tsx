import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makePdfFormFieldDraft } from '../../../lib/pdfStudio/model'
import { PdfTemplateFillVariablesPanel } from './PdfTemplateFillVariablesPanel'

const emptyField = makePdfFormFieldDraft({
  fieldKind: 'text',
  pageId: 'p1',
  name: 'paciente',
  value: '',
  xRatio: 0.1,
  yRatio: 0.2,
  wRatio: 0.35,
  hRatio: 0.05,
})

const filledField = makePdfFormFieldDraft({
  fieldKind: 'text',
  pageId: 'p2',
  name: 'rut',
  value: '12.345.678-9',
  xRatio: 0.1,
  yRatio: 0.3,
  wRatio: 0.25,
  hRatio: 0.05,
})

describe('<PdfTemplateFillVariablesPanel />', () => {
  it('lista variables, muestra progreso y permite escribir sin buscar en la hoja', () => {
    const onChange = vi.fn()
    const onJump = vi.fn()
    const onShowFieldGuidesChange = vi.fn()
    render(
      <PdfTemplateFillVariablesPanel
        fields={[emptyField, filledField]}
        pageIndexById={{ p1: 0, p2: 1 }}
        showFieldGuides={false}
        onChange={onChange}
        onShowFieldGuidesChange={onShowFieldGuidesChange}
        onJump={onJump}
      />,
    )

    expect(
      screen.getByRole('complementary', { name: /Variables de planilla/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('1 pendiente')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Variable paciente/i })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: /Variable rut/i })).toHaveValue(
      '12.345.678-9',
    )

    fireEvent.change(screen.getByRole('textbox', { name: /Variable paciente/i }), {
      target: { value: 'Camila' },
    })
    expect(onChange).toHaveBeenCalledWith(emptyField.id, 'Camila')

    fireEvent.click(screen.getByRole('button', { name: /Ir al campo paciente/i }))
    expect(onJump).toHaveBeenCalledWith(emptyField)

    fireEvent.click(screen.getByRole('checkbox', { name: /Mostrar campos/i }))
    expect(onShowFieldGuidesChange).toHaveBeenCalledWith(true)
  })

  it('es compacto, scrollable y ordena variables por coordenadas visuales', () => {
    const lowerLeft = makePdfFormFieldDraft({
      fieldKind: 'text',
      pageId: 'p1',
      name: 'abajo',
      value: '',
      xRatio: 0.1,
      yRatio: 0.5,
      wRatio: 0.3,
      hRatio: 0.05,
    })
    const upperRight = makePdfFormFieldDraft({
      fieldKind: 'text',
      pageId: 'p1',
      name: 'derecha',
      value: '',
      xRatio: 0.5,
      yRatio: 0.1,
      wRatio: 0.3,
      hRatio: 0.05,
    })
    const upperLeft = makePdfFormFieldDraft({
      fieldKind: 'text',
      pageId: 'p1',
      name: 'izquierda',
      value: '',
      xRatio: 0.1,
      yRatio: 0.1,
      wRatio: 0.3,
      hRatio: 0.05,
    })

    render(
      <PdfTemplateFillVariablesPanel
        fields={[lowerLeft, upperRight, upperLeft]}
        pageIndexById={{ p1: 0 }}
        onChange={vi.fn()}
        onJump={vi.fn()}
      />,
    )

    const panel = screen.getByRole('complementary', { name: /Variables de planilla/i })
    const labels = screen.getAllByRole('button', { name: /Ir al campo/i })

    expect(panel).toHaveClass('overflow-hidden')
    expect(screen.getByTestId('template-fill-fields-scroll')).toHaveClass(
      'overflow-y-auto',
    )
    expect(labels.map((label) => label.textContent)).toEqual([
      '[izquierda]',
      '[derecha]',
      '[abajo]',
    ])
    expect(screen.queryByText(/Página \d+/i)).not.toBeInTheDocument()
  })

  it('lleva al siguiente casillero pendiente y avisa cuando todo está completo', () => {
    const onJump = vi.fn()
    const { rerender } = render(
      <PdfTemplateFillVariablesPanel
        fields={[emptyField, filledField]}
        pageIndexById={{ p1: 0, p2: 1 }}
        onChange={vi.fn()}
        onJump={onJump}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Siguiente pendiente/i }))
    expect(onJump).toHaveBeenCalledWith(emptyField)

    rerender(
      <PdfTemplateFillVariablesPanel
        fields={[filledField]}
        pageIndexById={{ p2: 1 }}
        onChange={vi.fn()}
        onJump={onJump}
      />,
    )

    expect(screen.getByText('Todo listo para imprimir')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Siguiente pendiente/i })).toBeDisabled()
  })

  it('filtra pendientes sin perder el conteo total de la planilla', () => {
    const onShowPendingOnlyChange = vi.fn()
    render(
      <PdfTemplateFillVariablesPanel
        fields={[emptyField, filledField]}
        pageIndexById={{ p1: 0, p2: 1 }}
        showPendingOnly
        onChange={vi.fn()}
        onShowPendingOnlyChange={onShowPendingOnlyChange}
        onJump={vi.fn()}
      />,
    )

    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /Variable paciente/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: /Variable rut/i }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /Solo pendientes/i }))
    expect(onShowPendingOnlyChange).toHaveBeenCalledWith(false)
  })

  it('permite limpiar datos temporales e importar JSON/CSV desde el panel', () => {
    const onClearValues = vi.fn()
    const onImportValues = vi.fn()
    const file = new File(['{"paciente":"Camila"}'], 'datos.json', {
      type: 'application/json',
    })

    render(
      <PdfTemplateFillVariablesPanel
        fields={[emptyField]}
        pageIndexById={{ p1: 0 }}
        onChange={vi.fn()}
        onClearValues={onClearValues}
        onImportValues={onImportValues}
        onJump={vi.fn()}
      />,
    )

    expect(screen.getByText(/la plantilla base no cambia/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Limpiar datos/i }))
    expect(onClearValues).toHaveBeenCalledTimes(1)

    expect(screen.getByRole('button', { name: /Cargar datos/i })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Archivo de datos/i), {
      target: { files: [file] },
    })
    expect(onImportValues).toHaveBeenCalledWith(file)
  })

  it('muestra feedback compacto de importación de datos', () => {
    render(
      <PdfTemplateFillVariablesPanel
        fields={[emptyField]}
        pageIndexById={{ p1: 0 }}
        importFeedback={{
          tone: 'error',
          message: 'No se encontraron datos para importar.',
        }}
        onChange={vi.fn()}
        onJump={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'No se encontraron datos para importar.',
    )
  })

  it('permite rellenar rápido avanzando al siguiente casillero con Enter', () => {
    const onJump = vi.fn()
    render(
      <PdfTemplateFillVariablesPanel
        fields={[emptyField, filledField]}
        pageIndexById={{ p1: 0, p2: 1 }}
        onChange={vi.fn()}
        onJump={onJump}
      />,
    )

    const first = screen.getByRole('textbox', { name: /Variable paciente/i })
    const second = screen.getByRole('textbox', { name: /Variable rut/i })
    first.focus()

    fireEvent.keyDown(first, { key: 'Enter' })

    expect(second).toHaveFocus()
    expect(onJump).toHaveBeenCalledWith(filledField)
  })

  it('permite navegar casilleros con Tab y Shift+Tab desde el panel', () => {
    const onJump = vi.fn()
    render(
      <PdfTemplateFillVariablesPanel
        fields={[emptyField, filledField]}
        pageIndexById={{ p1: 0, p2: 1 }}
        onChange={vi.fn()}
        onJump={onJump}
      />,
    )

    const first = screen.getByRole('textbox', { name: /Variable paciente/i })
    const second = screen.getByRole('textbox', { name: /Variable rut/i })
    first.focus()

    fireEvent.keyDown(first, { key: 'Tab' })

    expect(second).toHaveFocus()
    expect(onJump).toHaveBeenCalledWith(filledField)

    fireEvent.keyDown(second, { key: 'Tab', shiftKey: true })

    expect(first).toHaveFocus()
    expect(onJump).toHaveBeenCalledWith(emptyField)
  })

  it('no atrapa Tab cuando no hay un casillero siguiente o anterior', () => {
    render(
      <PdfTemplateFillVariablesPanel
        fields={[emptyField, filledField]}
        pageIndexById={{ p1: 0, p2: 1 }}
        onChange={vi.fn()}
        onJump={vi.fn()}
      />,
    )

    const first = screen.getByRole('textbox', { name: /Variable paciente/i })
    const second = screen.getByRole('textbox', { name: /Variable rut/i })
    const leaveEnd = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
    })
    const leaveStart = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
      shiftKey: true,
    })

    second.dispatchEvent(leaveEnd)
    first.dispatchEvent(leaveStart)

    expect(leaveEnd.defaultPrevented).toBe(false)
    expect(leaveStart.defaultPrevented).toBe(false)
  })

  it('trata el texto estándar como placeholder vacío en el panel de relleno', () => {
    const hintedField = makePdfFormFieldDraft({
      fieldKind: 'text',
      pageId: 'p1',
      name: 'diagnostico',
      value: 'Escriba aquí',
      xRatio: 0.1,
      yRatio: 0.2,
      wRatio: 0.35,
      hRatio: 0.05,
    })
    const onChange = vi.fn()
    render(
      <PdfTemplateFillVariablesPanel
        fields={[hintedField]}
        pageIndexById={{ p1: 0 }}
        onChange={onChange}
        onJump={vi.fn()}
      />,
    )

    const input = screen.getByRole('textbox', { name: /Variable diagnostico/i })
    expect(screen.getByText('1 pendiente')).toBeInTheDocument()
    expect(input).toHaveValue('')

    fireEvent.focus(input)

    expect(onChange).toHaveBeenCalledWith(hintedField.id, '')
  })

  it('resalta el casillero activo en el panel lateral', () => {
    render(
      <PdfTemplateFillVariablesPanel
        fields={[emptyField, filledField]}
        activeFieldId={filledField.id}
        pageIndexById={{ p1: 0, p2: 1 }}
        onChange={vi.fn()}
        onJump={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Campo activo: rut')).toHaveClass(
      'border-[color:var(--accent-sage)]',
    )
    expect(screen.getByText('Activo')).toBeInTheDocument()
  })

  it('muestra un estado vacío simple cuando la planilla no tiene casilleros', () => {
    render(
      <PdfTemplateFillVariablesPanel
        fields={[]}
        pageIndexById={{}}
        onChange={vi.fn()}
        onJump={vi.fn()}
      />,
    )

    expect(screen.getByText(/Esta planilla no tiene casilleros/i)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
