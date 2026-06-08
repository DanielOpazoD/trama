import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  addPdfSource,
  emptyDoc,
  makeTextAnnotation,
} from '../../../../lib/pdfStudio/model/model'
import { PdfTextEditorPageSurface } from './PdfTextEditorPageSurface'

vi.mock('./usePdfTextEditorPageRender', () => ({
  usePdfTextEditorPageRender: () => ({
    areaRef: { current: null },
    bg: { url: 'blob:page', w: 800, h: 1000 },
    layout: { innerW: 400, innerH: 500, outerW: 400, outerH: 500, rot: 0 },
  }),
}))

const pdf = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })
const doc = addPdfSource(emptyDoc(), pdf, 2)

function setup(overrides: Partial<Parameters<typeof PdfTextEditorPageSurface>[0]> = {}) {
  const props: Parameters<typeof PdfTextEditorPageSurface>[0] = {
    doc,
    pageIndex: 1,
    isActive: false,
    mode: 'edit',
    edited: {},
    zoom: 1,
    tool: 'select',
    selectedId: null,
    selectedIds: [],
    editingId: null,
    drawing: null,
    selectionMarquee: null,
    selectionLasso: null,
    snapGuides: [],
    drawColor: '#222222',
    detectedForms: [],
    draftFields: [],
    pendingFormKind: true,
    selectedDraftId: null,
    selectedDraftIds: [],
    onActivate: vi.fn(),
    onActiveLayoutChange: vi.fn(),
    onStartDraw: vi.fn(),
    onStartMarquee: vi.fn(),
    onStartFormField: vi.fn(),
    onStartDrag: vi.fn(),
    onStartResize: vi.fn(),
    onSelectAnnotation: vi.fn(),
    onToggleAnnotation: vi.fn(),
    onToggleAnnotationDisabled: vi.fn(),
    onStartEdit: vi.fn(),
    onCommitText: vi.fn(),
    onCancelEdit: vi.fn(),
    onDetectedValueChange: vi.fn(),
    onDraftValueChange: vi.fn(),
    onOpenSignature: vi.fn(),
    onSelectDraft: vi.fn(),
    onStartDraftDrag: vi.fn(),
    onStartDraftResize: vi.fn(),
    ...overrides,
  }
  render(<PdfTextEditorPageSurface {...props} />)
  return props
}

describe('<PdfTextEditorPageSurface />', () => {
  it('coloca un casillero en la página clicada aunque no fuera la página activa', () => {
    const props = setup()

    fireEvent.pointerDown(screen.getByAltText('Página 2').parentElement!)

    expect(props.onActivate).toHaveBeenCalledWith(1)
    expect(props.onStartFormField).toHaveBeenCalledOnce()
  })

  it('en modo edición PDF permite seleccionar una página sin crear casilleros', () => {
    const props = setup({ pendingFormKind: false })

    fireEvent.pointerDown(screen.getByAltText('Página 2').parentElement!)

    expect(props.onActivate).toHaveBeenCalledWith(1)
    expect(props.onStartFormField).not.toHaveBeenCalled()
  })

  it('en modo crear plantilla deja las anotaciones PDF como solo lectura', () => {
    const text = makeTextAnnotation({
      text: 'Texto PDF normal',
      xRatio: 0.2,
      yRatio: 0.2,
      wRatio: 0.25,
      hRatio: 0.05,
      sizeRatio: 0.03,
      color: '#222222',
      font: 'sans',
      bold: false,
      opacity: 1,
      rotation: 0,
    })
    const props = setup({
      isActive: true,
      mode: 'design',
      edited: { 1: [text] },
      pendingFormKind: false,
    })

    fireEvent.pointerDown(screen.getByText('Texto PDF normal'))
    fireEvent.click(screen.getByText('Texto PDF normal'))

    expect(props.onStartDrag).not.toHaveBeenCalled()
    expect(props.onSelectAnnotation).not.toHaveBeenCalled()
  })
})
