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
    const { props } = setup({ selectedDraftId: draftCheckbox.id })

    fireEvent.pointerDown(screen.getByRole('checkbox', { name: 'acepta' }))
    expect(props.onStartDraftDrag).toHaveBeenCalledWith(expect.anything(), draftCheckbox)

    const handle = screen.getByRole('button', {
      name: 'Redimensionar campo acepta desde esquina inferior derecha',
    })
    fireEvent.pointerDown(handle)
    expect(props.onStartDraftResize).toHaveBeenCalledWith(
      expect.anything(),
      draftCheckbox,
      'se',
    )
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
})
