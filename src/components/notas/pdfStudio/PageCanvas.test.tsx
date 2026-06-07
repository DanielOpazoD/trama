import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { PageCanvas } from './PageCanvas'
import { type PageLayout } from '../../../lib/pdfStudio/editorGeometry'

const LAYOUT: PageLayout = { rot: 0, outerW: 400, outerH: 560, innerW: 400, innerH: 560 }
const BG = { url: 'blob:bg', w: 400, h: 560 }

function setup(overrides: Partial<Parameters<typeof PageCanvas>[0]> = {}) {
  const props = {
    areaRef: createRef<HTMLDivElement>(),
    layout: LAYOUT as PageLayout | null,
    bg: BG as { url: string; w: number; h: number } | null,
    zoom: 1.5,
    tool: 'select' as const,
    currentPage: 0,
    onStartDraw: vi.fn(),
    onStartMarquee: vi.fn(),
    onStartFormField: vi.fn(),
    placingFormField: false,
    children: <div data-testid="anotaciones" />,
    ...overrides,
  }
  const utils = render(<PageCanvas {...props} />)
  return { ...utils, props }
}

describe('<PageCanvas />', () => {
  it('muestra "cargando" sin layout o sin fondo', () => {
    setup({ layout: null })
    expect(screen.getByText(/cargando página/i)).toBeInTheDocument()
    expect(screen.queryByAltText('Página 1')).not.toBeInTheDocument()
  })

  it('renderiza la página, las anotaciones (children) y el transform con rotación + zoom', () => {
    setup()
    const img = screen.getByAltText('Página 1')
    expect(img).toBeInTheDocument()
    expect(screen.getByTestId('anotaciones')).toBeInTheDocument()
    const pageDiv = img.parentElement!
    expect(pageDiv.style.transform).toContain('rotate(0deg)')
    expect(pageDiv.style.transform).toContain('scale(1.5)')
    expect(pageDiv).not.toHaveClass('bg-white')
  })

  it('apuntar el fondo inicia el gesto de selección por marco en modo seleccionar', () => {
    const { props } = setup()
    fireEvent.pointerDown(screen.getByAltText('Página 1').parentElement!)
    expect(props.onStartMarquee).toHaveBeenCalledOnce()
  })

  it('en modo seleccionar NO empieza a dibujar al apuntar', () => {
    const { props } = setup({ tool: 'select' })
    fireEvent.pointerDown(screen.getByAltText('Página 1').parentElement!)
    expect(props.onStartDraw).not.toHaveBeenCalled()
    expect(props.onStartMarquee).toHaveBeenCalledOnce()
  })

  it('con una herramienta de dibujo (forma) empieza a dibujar al apuntar', () => {
    const { props } = setup({ tool: 'rect' })
    fireEvent.pointerDown(screen.getByAltText('Página 1').parentElement!)
    expect(props.onStartDraw).toHaveBeenCalledOnce()
  })

  it('al colocar un campo especial usa el gesto de formulario antes que el marquee', () => {
    const { props } = setup({ placingFormField: true })
    fireEvent.pointerDown(screen.getByAltText('Página 1').parentElement!)
    expect(props.onStartFormField).toHaveBeenCalledOnce()
    expect(props.onStartMarquee).not.toHaveBeenCalled()
    expect(props.onStartDraw).not.toHaveBeenCalled()
  })

  it('puede renderizar dentro de un visor continuo sin crear scroll propio por página', () => {
    const { container } = setup({ scrollContainer: false })
    const wrapper = container.firstElementChild!

    expect(wrapper).not.toHaveClass('flex-1')
    expect(wrapper).not.toHaveClass('overflow-auto')
    expect(wrapper).not.toHaveClass('place-items-center')
    expect(screen.getByAltText('Página 1')).toBeInTheDocument()
  })

  it('no centra con grid una hoja ancha y reserva margen simétrico para ambos bordes', () => {
    setup({ scrollContainer: false, zoom: 2 })
    const img = screen.getByAltText('Página 1')
    const stage = img.parentElement!.parentElement!
    const sheet = img.parentElement!

    expect(stage).toHaveClass('mx-auto')
    expect(stage).toHaveStyle({ width: '848px', height: '1168px' })
    expect(sheet).toHaveStyle({ left: '424px', top: '584px' })
  })
})
