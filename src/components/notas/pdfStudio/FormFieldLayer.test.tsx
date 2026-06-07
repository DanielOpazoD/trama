import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makePdfFormFieldDraft } from '../../../lib/pdfStudio/model'
import { FormFieldLayer, type VisualPdfFormWidget } from './FormFieldLayer'

const detectedText: VisualPdfFormWidget = {
  id: 's1-fullName-0',
  sourceId: 's1',
  fieldName: 'fullName',
  type: 'text',
  value: 'Inicial',
  xRatio: 0.1,
  yRatio: 0.2,
  wRatio: 0.35,
  hRatio: 0.04,
}

const draftCheckbox = makePdfFormFieldDraft({
  fieldKind: 'checkbox',
  pageId: 'p1',
  name: 'acepta',
  value: false,
  xRatio: 0.2,
  yRatio: 0.3,
  wRatio: 0.04,
  hRatio: 0.04,
})

function setup(overrides: Partial<Parameters<typeof FormFieldLayer>[0]> = {}) {
  const props = {
    detectedWidgets: [detectedText],
    draftFields: [draftCheckbox],
    selectedDraftId: null as string | null,
    onDetectedValueChange: vi.fn(),
    onDraftValueChange: vi.fn(),
    onSelectDraft: vi.fn(),
    onStartDraftDrag: vi.fn(),
    onStartDraftResize: vi.fn(),
    onOpenSignature: vi.fn(),
    ...overrides,
  }
  const utils = render(<FormFieldLayer {...props} />)
  return { ...utils, props }
}

describe('<FormFieldLayer />', () => {
  it('renderiza widgets detectados como controles visuales editables', () => {
    const { props } = setup()
    const input = screen.getByRole('textbox', { name: 'fullName' })

    expect(input).toHaveValue('Inicial')
    fireEvent.change(input, { target: { value: 'Daniel' } })

    expect(props.onDetectedValueChange).toHaveBeenCalledWith('s1', 'fullName', 'Daniel')
  })

  it('renderiza campos creados desde cero y permite editar checkbox', () => {
    const { props } = setup()
    const checkbox = screen.getByRole('checkbox', { name: 'acepta' })

    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)

    expect(props.onDraftValueChange).toHaveBeenCalledWith(draftCheckbox.id, true)
  })

  it('selecciona campos draft y muestra handles de redimensionado', () => {
    const { props } = setup({ selectedDraftId: draftCheckbox.id, zoom: 2 })

    fireEvent.pointerDown(
      screen.getByRole('checkbox', { name: 'acepta' }).closest('div')!,
    )
    expect(props.onStartDraftDrag).toHaveBeenCalledWith(expect.anything(), draftCheckbox)

    const handle = screen.getByRole('button', {
      name: 'Redimensionar campo acepta desde esquina inferior derecha',
    })
    expect(handle).toHaveStyle({ width: '4px', height: '4px' })
    fireEvent.pointerDown(handle)
    expect(props.onStartDraftResize).toHaveBeenCalledWith(
      expect.anything(),
      draftCheckbox,
      'se',
    )
  })

  it('compensa el grosor del marco para que el zoom no engorde el casillero', () => {
    setup({ selectedDraftId: draftCheckbox.id, zoom: 2 })

    expect(screen.getByRole('checkbox', { name: 'acepta' }).closest('label')).toHaveStyle(
      {
        borderWidth: '0.5px',
      },
    )
  })

  it('en modo diseño permite arrastrar desde el cuerpo del casillero', () => {
    const { props } = setup({ selectedDraftId: draftCheckbox.id })

    fireEvent.pointerDown(screen.getByRole('checkbox', { name: 'acepta' }))

    expect(props.onSelectDraft).toHaveBeenCalledWith(draftCheckbox.id, false)
    expect(props.onStartDraftDrag).toHaveBeenCalledWith(expect.anything(), draftCheckbox)
  })

  it('muestra campo de firma simple con acción para firmar', () => {
    const signature = makePdfFormFieldDraft({
      fieldKind: 'signature',
      pageId: 'p1',
      name: 'firma',
      value: '',
      xRatio: 0.25,
      yRatio: 0.45,
      wRatio: 0.3,
      hRatio: 0.1,
    })
    const { props } = setup({ detectedWidgets: [], draftFields: [signature] })

    fireEvent.click(screen.getByRole('button', { name: 'Firmar firma' }))

    expect(props.onOpenSignature).toHaveBeenCalledWith(signature)
  })

  it('en modo llenado muestra placeholder de escritura y no permite mover/redimensionar', () => {
    const text = makePdfFormFieldDraft({
      fieldKind: 'text',
      pageId: 'p1',
      name: 'paciente',
      value: '',
      xRatio: 0.2,
      yRatio: 0.3,
      wRatio: 0.3,
      hRatio: 0.05,
    })
    const { props } = setup({
      detectedWidgets: [],
      draftFields: [text],
      mode: 'fill',
      selectedDraftId: text.id,
    })

    const input = screen.getByRole('textbox', { name: 'paciente' })
    expect(input).toHaveAttribute('placeholder', 'Escriba aquí')
    expect(screen.getByText('#1')).toHaveStyle({
      right: '-4px',
      transform: 'translate(100%, -50%)',
    })
    expect(screen.queryByText('[paciente]')).toBeNull()
    expect(input).toHaveStyle({ borderWidth: '1px' })
    expect(
      screen.queryByRole('button', {
        name: 'Redimensionar campo paciente desde esquina inferior derecha',
      }),
    ).toBeNull()

    fireEvent.pointerDown(input.closest('div')!)
    expect(props.onSelectDraft).not.toHaveBeenCalled()
    expect(props.onStartDraftDrag).not.toHaveBeenCalled()
  })

  it('limpia el valor estándar Escriba aquí al enfocar un casillero de relleno', () => {
    const text = makePdfFormFieldDraft({
      fieldKind: 'text',
      pageId: 'p1',
      name: 'paciente',
      value: 'Escriba aquí',
      xRatio: 0.2,
      yRatio: 0.3,
      wRatio: 0.3,
      hRatio: 0.05,
    })
    const { props } = setup({
      detectedWidgets: [],
      draftFields: [text],
      mode: 'fill',
      selectedDraftId: text.id,
    })

    fireEvent.focus(screen.getByRole('textbox', { name: 'paciente' }))

    expect(props.onDraftValueChange).toHaveBeenCalledWith(text.id, '')
  })

  it('muestra el placeholder de diseño con el tamaño de letra del casillero', () => {
    const text = makePdfFormFieldDraft({
      fieldKind: 'text',
      pageId: 'p1',
      name: 'paciente',
      value: '',
      xRatio: 0.2,
      yRatio: 0.3,
      wRatio: 0.3,
      hRatio: 0.05,
      sizeRatio: 0.05,
    })
    setup({
      detectedWidgets: [],
      draftFields: [text],
      pageHeightPx: 600,
      selectedDraftId: text.id,
      selectedDraftIds: [text.id],
    })

    const input = screen.getByRole('textbox', { name: 'paciente' })
    expect(input).toHaveAttribute('placeholder', 'Escriba aquí')
    expect(input).toHaveStyle({ fontSize: '30px' })
  })
})
