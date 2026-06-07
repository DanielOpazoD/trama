import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { PdfTextEditorScrollArea } from './PdfTextEditorScrollArea'

describe('<PdfTextEditorScrollArea />', () => {
  it('deja la rueda al scroll nativo del navegador sin prevenir el evento', () => {
    render(
      <PdfTextEditorScrollArea fillMode={false} scrollContainerRef={createRef()}>
        <div style={{ height: 2000 }}>Documento</div>
      </PdfTextEditorScrollArea>,
    )

    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 180,
    })
    const allowed = screen.getByText('Documento').parentElement!.dispatchEvent(event)

    expect(allowed).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })

  it('expone el área de relleno solo en modo planilla', () => {
    render(
      <PdfTextEditorScrollArea fillMode scrollContainerRef={createRef()}>
        <div>Planilla</div>
      </PdfTextEditorScrollArea>,
    )

    expect(
      screen.getByRole('main', { name: 'Área de relleno de planilla' }),
    ).toBeInTheDocument()
  })
})
