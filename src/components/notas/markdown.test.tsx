import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderMarkdown } from './markdown'

function renderMd(src: string) {
  return render(<div>{renderMarkdown(src)}</div>)
}

describe('renderMarkdown', () => {
  it('negrita, cursiva y código inline', () => {
    renderMd('un **fuerte**, un _suave_ y un `codigo`')
    expect(screen.getByText('fuerte').tagName).toBe('STRONG')
    expect(screen.getByText('suave').tagName).toBe('EM')
    expect(screen.getByText('codigo').tagName).toBe('CODE')
  })

  it('enlaces markdown con href y target', () => {
    renderMd('ver [Trama](https://example.com) acá')
    const link = screen.getByRole('link', { name: 'Trama' })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('resalta #etiquetas sin confundirlas con encabezados', () => {
    renderMd('una idea con #filosofia')
    expect(screen.getByText('#filosofia')).toBeInTheDocument()
  })

  it('encabezado (con espacio) NO es una etiqueta', () => {
    renderMd('# Título grande')
    expect(screen.getByText('Título grande')).toBeInTheDocument()
  })

  it('lista de tareas marca lo hecho con tachado', () => {
    renderMd('- [x] terminado\n- [ ] pendiente')
    expect(screen.getByText('terminado').className).toContain('line-through')
    expect(screen.getByText('pendiente').className).not.toContain('line-through')
  })

  it('viñetas simples', () => {
    renderMd('- uno\n- dos')
    expect(screen.getByText('uno')).toBeInTheDocument()
    expect(screen.getByText('dos')).toBeInTheDocument()
  })
})
