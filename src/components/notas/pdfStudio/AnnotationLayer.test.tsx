import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AnnotationLayer } from './AnnotationLayer'
import {
  makeHighlightAnnotation,
  makeTextAnnotation,
  type Annotation,
} from '../../../lib/pdfStudio/model'

const TEXT = makeTextAnnotation({
  text: 'Hola',
  xRatio: 0.2,
  yRatio: 0.3,
  sizeRatio: 0.04,
  font: 'sans',
  bold: false,
  color: '#222222',
  opacity: 1,
  rotation: 0,
})
const HL = makeHighlightAnnotation({
  xRatio: 0.1,
  yRatio: 0.1,
  wRatio: 0.4,
  hRatio: 0.2,
  color: '#b3412c',
  opacity: 0.35,
})
const DISPLAY_TITLE = 'Doble clic para editar · arrastra para mover'

function setup(overrides: Partial<Parameters<typeof AnnotationLayer>[0]> = {}) {
  const props = {
    annotations: [TEXT, HL] as Annotation[],
    innerW: 720,
    innerH: 1000,
    tool: 'select' as const,
    selectedId: null as string | null,
    editingId: null as string | null,
    drawing: null,
    drawColor: '#222222',
    onStartDrag: vi.fn(),
    onSelect: vi.fn(),
    onStartEdit: vi.fn(),
    onCommitText: vi.fn(),
    onCancelEdit: vi.fn(),
    ...overrides,
  }
  const utils = render(<AnnotationLayer {...props} />)
  return { ...utils, props }
}

describe('<AnnotationLayer />', () => {
  it('pinta el texto y el resaltado', () => {
    setup()
    expect(screen.getByText('Hola')).toBeInTheDocument()
    expect(screen.getByTitle(DISPLAY_TITLE)).toBeInTheDocument()
    expect(screen.getByTitle('Arrastra para mover')).toBeInTheDocument()
  })

  it('clic en el texto selecciona; doble clic lo edita', () => {
    const { props } = setup()
    fireEvent.click(screen.getByTitle(DISPLAY_TITLE))
    expect(props.onSelect).toHaveBeenCalledWith(TEXT.id)
    fireEvent.doubleClick(screen.getByTitle(DISPLAY_TITLE))
    expect(props.onStartEdit).toHaveBeenCalledWith(TEXT.id)
  })

  it('clic en el resaltado lo selecciona', () => {
    const { props } = setup()
    fireEvent.click(screen.getByTitle('Arrastra para mover'))
    expect(props.onSelect).toHaveBeenCalledWith(HL.id)
  })

  it('en edición muestra el cuadro editable y confirma con Enter', () => {
    const { props } = setup({ editingId: TEXT.id })
    const box = screen.getByRole('textbox', { name: 'Editar texto' })
    expect(box).toBeInTheDocument()
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(props.onCommitText).toHaveBeenCalledWith(TEXT.id, 'Hola')
  })

  it('dibuja el preview translúcido mientras se arrastra un resaltado', () => {
    const { container } = setup({
      tool: 'highlight',
      drawing: { x0: 10, y0: 10, x1: 60, y1: 40 },
    })
    expect(container.querySelector('div[style*="dashed"]')).not.toBeNull()
  })

  it('dibuja el preview vectorial (SVG) mientras se arrastra una forma', () => {
    const { container } = setup({
      tool: 'rect',
      drawing: { x0: 10, y0: 10, x1: 60, y1: 40 },
    })
    // El preview de forma es un SVG, no el div punteado del resaltado.
    expect(container.querySelector('svg rect')).not.toBeNull()
    expect(container.querySelector('div[style*="dashed"]')).toBeNull()
  })
})
