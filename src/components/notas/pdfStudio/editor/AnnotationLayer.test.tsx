import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AnnotationLayer } from './AnnotationLayer'
import {
  makeHighlightAnnotation,
  makeImageAnnotation,
  makeRedactionAnnotation,
  makeShapeAnnotation,
  makeTextAnnotation,
  type Annotation,
} from '../../../../lib/pdfStudio/model/model'

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
const REDACTION = makeRedactionAnnotation({
  xRatio: 0.5,
  yRatio: 0.15,
  wRatio: 0.18,
  hRatio: 0.08,
  color: '#000000',
})
const IMG = makeImageAnnotation({
  src: 'data:image/png;base64,iVBORw0KGgo=',
  xRatio: 0.3,
  yRatio: 0.2,
  wRatio: 0.25,
  hRatio: 0.1,
  opacity: 0.8,
})
const SHAPE = makeShapeAnnotation({
  shape: 'rect',
  x0Ratio: 0.15,
  y0Ratio: 0.2,
  x1Ratio: 0.45,
  y1Ratio: 0.4,
  color: '#222222',
  strokeRatio: 0.003,
})
const DISPLAY_TITLE = 'Doble clic para editar · arrastra para mover'

function setup(overrides: Partial<Parameters<typeof AnnotationLayer>[0]> = {}) {
  const props = {
    annotations: [TEXT, HL, IMG, SHAPE] as Annotation[],
    innerW: 720,
    innerH: 1000,
    tool: 'select' as const,
    selectedId: null as string | null,
    selectedIds: [] as string[],
    editingId: null as string | null,
    drawing: null,
    drawColor: '#222222',
    onStartDrag: vi.fn(),
    onSelect: vi.fn(),
    onToggleSelect: vi.fn(),
    onStartEdit: vi.fn(),
    onCommitText: vi.fn(),
    onCancelEdit: vi.fn(),
    onStartResize: vi.fn(),
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

  it('pinta una imagen estampada y permite seleccionarla', () => {
    const { props } = setup()
    const stamp = screen.getByRole('img', { name: 'Imagen estampada' })
    expect(stamp).toBeInTheDocument()
    fireEvent.click(stamp)
    expect(props.onSelect).toHaveBeenCalledWith(IMG.id)
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

  it('pinta una redacción segura y permite redimensionarla', () => {
    const { props } = setup({
      annotations: [TEXT, REDACTION],
      selectedId: REDACTION.id,
    })

    const redaction = screen.getByTitle('Redacción segura pendiente')
    expect(redaction).toBeInTheDocument()
    fireEvent.click(redaction)
    expect(props.onSelect).toHaveBeenCalledWith(REDACTION.id)

    const handle = screen.getByRole('button', {
      name: 'Redimensionar redacción desde esquina inferior derecha',
    })
    expect(
      screen.getAllByLabelText(/Redimensionar redacción desde esquina/i),
    ).toHaveLength(4)
    fireEvent.pointerDown(handle)
    expect(props.onStartResize).toHaveBeenCalledWith(expect.anything(), REDACTION, 'se')
  })

  it('permite sumar o quitar selección con modificador', () => {
    const { props } = setup({ selectedId: TEXT.id, selectedIds: [TEXT.id, HL.id] })

    fireEvent.pointerDown(screen.getByTitle('Arrastra para mover'), { metaKey: true })
    expect(props.onStartDrag).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTitle('Arrastra para mover'), { metaKey: true })
    expect(props.onToggleSelect).toHaveBeenCalledWith(HL.id)

    const selectedHighlights = screen.getAllByTitle('Arrastra para mover')
    expect(selectedHighlights[0]?.style.outline).toContain('var(--accent-sage)')
  })

  it('muestra handles de redimensionado al seleccionar un resaltado', () => {
    const { props } = setup({ selectedId: HL.id })
    const handle = screen.getByRole('button', {
      name: 'Redimensionar resaltado desde esquina inferior derecha',
    })
    expect(
      screen.getAllByLabelText(/Redimensionar resaltado desde esquina/i),
    ).toHaveLength(4)
    fireEvent.pointerDown(handle)
    expect(props.onStartResize).toHaveBeenCalledWith(expect.anything(), HL, 'se')
  })

  it('muestra handles de redimensionado al seleccionar una imagen estampada', () => {
    const { props } = setup({ selectedId: IMG.id })
    const handle = screen.getByRole('button', {
      name: 'Redimensionar imagen desde esquina inferior derecha',
    })
    expect(screen.getAllByLabelText(/Redimensionar imagen desde esquina/i)).toHaveLength(
      4,
    )
    fireEvent.pointerDown(handle)
    expect(props.onStartResize).toHaveBeenCalledWith(expect.anything(), IMG, 'se')
  })

  it('muestra handles de redimensionado al seleccionar un cuadro de texto', () => {
    const { props } = setup({ selectedId: TEXT.id, zoom: 2 })
    const handle = screen.getByRole('button', {
      name: 'Redimensionar texto desde esquina inferior derecha',
    })
    expect(handle).toHaveStyle({ width: '7px', height: '7px' })
    expect(screen.getByTitle(DISPLAY_TITLE).style.outlineWidth).toBe('0.75px')
    fireEvent.pointerDown(handle)
    expect(props.onStartResize).toHaveBeenCalledWith(expect.anything(), TEXT, 'se')
  })

  it('pinta cuadros de texto con ancho y alto reales cuando están definidos', () => {
    setup({ annotations: [{ ...TEXT, wRatio: 0.25, hRatio: 0.08 }] })
    expect(screen.getByTitle(DISPLAY_TITLE)).toHaveStyle({
      width: '25%',
      height: '8%',
      whiteSpace: 'pre-wrap',
    })
  })

  it('muestra handles de redimensionado al seleccionar una forma', () => {
    const { props } = setup({ selectedId: SHAPE.id })
    const handle = screen.getByRole('button', {
      name: 'Redimensionar forma desde esquina inferior derecha',
    })
    expect(screen.getAllByLabelText(/Redimensionar forma desde esquina/i)).toHaveLength(4)
    fireEvent.pointerDown(handle)
    expect(props.onStartResize).toHaveBeenCalledWith(expect.anything(), SHAPE, 'se')
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

  it('pinta guías de alineación durante snapping', () => {
    const { container } = setup({
      snapGuides: [
        { axis: 'x', ratio: 0.5 },
        { axis: 'y', ratio: 0.25 },
      ],
    })

    expect(container.querySelector('[data-pdf-snap-guide="x"]')).not.toBeNull()
    expect(container.querySelector('[data-pdf-snap-guide="y"]')).not.toBeNull()
  })

  it('pinta el marco de selección por área en modo seleccionar', () => {
    const { container } = setup({
      selectionMarquee: { x0: 20, y0: 30, x1: 160, y1: 130 },
    })

    expect(container.querySelector('[data-pdf-selection-marquee="true"]')).not.toBeNull()
  })

  it('pinta el lazo de selección libre en modo seleccionar', () => {
    const { container } = setup({
      selectionLasso: [
        { x: 20, y: 30 },
        { x: 160, y: 35 },
        { x: 120, y: 130 },
      ],
    })

    expect(container.querySelector('[data-pdf-selection-lasso="true"]')).not.toBeNull()
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
