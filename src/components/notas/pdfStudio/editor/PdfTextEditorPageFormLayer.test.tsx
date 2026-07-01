import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  addPdfSource,
  emptyDoc,
  makePdfFormFieldDraft,
} from '../../../../lib/pdfStudio/model/model'
import { PdfTextEditorPageFormLayer } from './PdfTextEditorPageFormLayer'

const pdf = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })
const doc = addPdfSource(emptyDoc(), pdf, 2)
const page = doc.pages[1]!
const widgetPageIndex = page.kind === 'pdf' ? page.pageIndex : 0
const draft = makePdfFormFieldDraft({
  fieldKind: 'text',
  pageId: page.id,
  name: 'paciente',
  value: '',
  xRatio: 0.1,
  yRatio: 0.2,
  wRatio: 0.3,
  hRatio: 0.05,
})
const signature = makePdfFormFieldDraft({
  fieldKind: 'signature',
  pageId: page.id,
  name: 'firma',
  value: '',
  xRatio: 0.2,
  yRatio: 0.4,
  wRatio: 0.25,
  hRatio: 0.08,
})

function setup(
  overrides: Partial<Parameters<typeof PdfTextEditorPageFormLayer>[0]> = {},
) {
  const props: Parameters<typeof PdfTextEditorPageFormLayer>[0] = {
    activeDraftId: null,
    detectedForms: [],
    draftFields: [],
    isActive: false,
    layout: { innerW: 400, innerH: 500, outerW: 400, outerH: 500, rot: 0 },
    mode: 'edit',
    onActivate: vi.fn(),
    onDetectedValueChange: vi.fn(),
    onDraftFocus: vi.fn(),
    onDraftValueChange: vi.fn(),
    onOpenSignature: vi.fn(),
    onSelectDraft: vi.fn(),
    onStartDraftDrag: vi.fn(),
    onStartDraftResize: vi.fn(),
    page,
    pageIndex: 1,
    selectedDraftId: null,
    selectedDraftIds: [],
    zoom: 1,
    ...overrides,
  }
  const utils = render(<PdfTextEditorPageFormLayer {...props} />)
  return { ...utils, props }
}

describe('<PdfTextEditorPageFormLayer />', () => {
  it('no monta una capa inactiva sin formularios visibles', () => {
    const { container } = setup()

    expect(container).toBeEmptyDOMElement()
  })

  it('activa la página inactiva antes de seleccionar un casillero draft', () => {
    const { props } = setup({ draftFields: [draft] })

    fireEvent.pointerDown(screen.getByRole('textbox', { name: 'paciente' }), {
      shiftKey: true,
    })

    expect(props.onActivate).toHaveBeenCalledWith(1)
    expect(props.onSelectDraft).toHaveBeenCalledWith(draft.id, true)
    expect(props.onStartDraftDrag).not.toHaveBeenCalled()
  })

  it('preserva handlers de edición cuando la página está activa', () => {
    const { props } = setup({
      draftFields: [draft],
      isActive: true,
      selectedDraftId: draft.id,
      selectedDraftIds: [draft.id],
    })

    fireEvent.pointerDown(screen.getByRole('textbox', { name: 'paciente' }))

    expect(props.onSelectDraft).toHaveBeenCalledWith(draft.id, false)
    expect(props.onStartDraftDrag).toHaveBeenCalledWith(expect.anything(), draft)
  })

  it('activa la página inactiva antes de abrir firma', () => {
    const { props } = setup({ draftFields: [signature] })

    fireEvent.click(screen.getByRole('button', { name: 'Firmar firma' }))

    expect(props.onActivate).toHaveBeenCalledWith(1)
    expect(props.onOpenSignature).toHaveBeenCalledWith(signature)
  })

  it('mapea widgets detectados de la página activa hacia cambios de valor', () => {
    const { props } = setup({
      detectedForms: [
        {
          sourceId: page.sourceId,
          values: { folio: '123' },
          fields: [
            {
              name: 'folio',
              type: 'text',
              value: '',
              readOnly: false,
              required: false,
              widgets: [
                {
                  pageIndex: widgetPageIndex,
                  widgetIndex: 0,
                  xRatio: 0.15,
                  yRatio: 0.1,
                  wRatio: 0.2,
                  hRatio: 0.04,
                },
              ],
            },
          ],
        },
      ],
      isActive: true,
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'folio' }), {
      target: { value: '456' },
    })

    expect(props.onDetectedValueChange).toHaveBeenCalledWith(
      page.sourceId,
      'folio',
      '456',
    )
  })
})
