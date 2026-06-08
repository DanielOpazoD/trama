import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PdfTemplateModeBanner } from './PdfTemplateModeBanner'

describe('<PdfTemplateModeBanner />', () => {
  it('explica el modo planilla como flujo de llenar e imprimir', () => {
    const onPrint = vi.fn()

    render(<PdfTemplateModeBanner mode="fill" fieldCount={4} onPrint={onPrint} />)

    expect(screen.getByRole('status')).toHaveTextContent('Rellenar e imprimir')
    expect(screen.getByRole('status')).toHaveTextContent('solo completa')
    expect(screen.getByRole('status')).toHaveTextContent('sin editar la plantilla')

    fireEvent.click(screen.getByRole('button', { name: /Imprimir planilla/i }))

    expect(onPrint).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: /Editar estructura/i })).toBeNull()
  })

  it('explica el modo edición como diseño de una plantilla reusable', () => {
    render(<PdfTemplateModeBanner mode="design" fieldCount={2} />)

    expect(screen.getByRole('status')).toHaveTextContent('Diseñar planilla')
    expect(screen.getByRole('status')).toHaveTextContent('define casilleros')
    expect(screen.getByRole('status')).toHaveTextContent('plantilla reusable')
    expect(screen.queryByRole('button', { name: /Imprimir planilla/i })).toBeNull()
  })
})
