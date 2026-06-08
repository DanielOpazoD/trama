import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FormFieldSelectionInspector } from './FormFieldSelectionInspector'

describe('<FormFieldSelectionInspector />', () => {
  it('muestra acciones de orden para una selección múltiple de casilleros', () => {
    const onAlign = vi.fn()
    const onDistribute = vi.fn()
    const onApplyStyle = vi.fn()

    render(
      <FormFieldSelectionInspector
        activeBold={false}
        activeSizeRatio={0.04}
        count={3}
        onAlign={onAlign}
        onApplyStyle={onApplyStyle}
        onDistribute={onDistribute}
      />,
    )

    expect(screen.getByText('3 casilleros')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Alinear casilleros al centro' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Distribuir casilleros horizontalmente' }),
    )

    expect(onAlign).toHaveBeenCalledWith('center')
    expect(onDistribute).toHaveBeenCalledWith('x')

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar tamaño de casilleros' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar negrita a casilleros' }))

    expect(onApplyStyle).toHaveBeenCalledWith({ sizeRatio: 0.045 })
    expect(onApplyStyle).toHaveBeenCalledWith({ bold: true })
  })
})
