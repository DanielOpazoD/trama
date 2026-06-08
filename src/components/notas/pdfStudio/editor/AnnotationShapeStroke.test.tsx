import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ShapeStroke } from './AnnotationShapeStroke'

function draw(ui: React.ReactElement) {
  const { container } = render(<svg>{ui}</svg>)
  return container.querySelector('svg') as SVGSVGElement
}

const base = {
  p0: { x: 10, y: 20 },
  p1: { x: 40, y: 60 },
  color: '#222222',
  sw: 2,
  opacity: 1,
}

describe('ShapeStroke', () => {
  it('dibuja un rectángulo con la caja delimitada por p0/p1', () => {
    const svg = draw(<ShapeStroke shape="rect" {...base} />)
    const rect = svg.querySelector('rect')!
    expect(rect).toBeTruthy()
    expect(rect.getAttribute('width')).toBe('30')
    expect(rect.getAttribute('height')).toBe('40')
    expect(rect.getAttribute('stroke-dasharray')).toBeNull()
  })

  it('dibuja un óvalo centrado en la caja', () => {
    const svg = draw(<ShapeStroke shape="oval" {...base} />)
    const ellipse = svg.querySelector('ellipse')!
    expect(ellipse.getAttribute('rx')).toBe('15')
    expect(ellipse.getAttribute('ry')).toBe('20')
  })

  it('dibuja la marca X con dos diagonales cruzadas', () => {
    const svg = draw(<ShapeStroke shape="x" {...base} />)
    const lines = svg.querySelectorAll('line')
    expect(lines).toHaveLength(2)
    // Sin `dashed`, la X activa es de trazo continuo.
    expect(lines[0]!.getAttribute('stroke-dasharray')).toBeNull()
  })

  it('aplica trazo punteado a la X deshabilitada', () => {
    const svg = draw(<ShapeStroke shape="x" {...base} dashed />)
    const lines = svg.querySelectorAll('line')
    expect(lines).toHaveLength(2)
    for (const line of lines) {
      expect(line.getAttribute('stroke-dasharray')).toBeTruthy()
    }
  })

  it('dibuja una línea simple entre p0 y p1', () => {
    const svg = draw(<ShapeStroke shape="line" {...base} />)
    expect(svg.querySelectorAll('line')).toHaveLength(1)
    expect(svg.querySelector('path')).toBeNull()
  })

  it('dibuja una flecha con cabeza (path) además de la línea', () => {
    const svg = draw(<ShapeStroke shape="arrow" {...base} />)
    expect(svg.querySelectorAll('line')).toHaveLength(1)
    const path = svg.querySelector('path')!
    expect(path).toBeTruthy()
    expect(path.getAttribute('d')).toMatch(/^M /)
  })
})
