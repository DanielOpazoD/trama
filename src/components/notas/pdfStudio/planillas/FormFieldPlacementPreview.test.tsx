import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PageLayout } from '../../../../lib/pdfStudio/model/editorGeometry'
import { FormFieldPlacementPreview } from './FormFieldPlacementPreview'

const layout: PageLayout = {
  innerW: 400,
  innerH: 800,
  outerW: 400,
  outerH: 800,
  rot: 0,
}

function renderPreview() {
  const { container } = render(
    <div data-testid="sheet" style={{ position: 'relative' }}>
      <FormFieldPlacementPreview
        box={{ wRatio: 0.2, hRatio: 0.05 }}
        layout={layout}
        zoom={1}
      />
    </div>,
  )
  const sheet = container.firstElementChild as HTMLElement
  vi.spyOn(sheet, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 400,
    height: 800,
    right: 400,
    bottom: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  return sheet
}

describe('<FormFieldPlacementPreview />', () => {
  it('no muestra el fantasma hasta que el cursor entra a la página', () => {
    renderPreview()
    expect(screen.queryByTestId('form-field-placement-preview')).not.toBeInTheDocument()
  })

  it('sigue el cursor, centrado como quedará el casillero al hacer clic', () => {
    const sheet = renderPreview()

    fireEvent.pointerMove(sheet, { clientX: 200, clientY: 400 })

    const ghost = screen.getByTestId('form-field-placement-preview')
    // Centro de la página (0.5, 0.5) → caja centrada en el cursor.
    expect(ghost.style.left).toBe('40%')
    expect(ghost.style.top).toBe('47.5%')
    expect(ghost.style.width).toBe('20%')
    expect(ghost.style.height).toBe('5%')
  })

  it('acota el fantasma a los límites y desaparece al salir de la página', () => {
    const sheet = renderPreview()

    fireEvent.pointerMove(sheet, { clientX: 399, clientY: 799 })
    const ghost = screen.getByTestId('form-field-placement-preview')
    expect(parseFloat(ghost.style.left)).toBeLessThanOrEqual(80)
    expect(parseFloat(ghost.style.top)).toBeLessThanOrEqual(95)

    fireEvent.pointerLeave(sheet)
    expect(screen.queryByTestId('form-field-placement-preview')).not.toBeInTheDocument()
  })
})
