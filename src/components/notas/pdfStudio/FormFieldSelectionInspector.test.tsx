import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FormFieldSelectionInspector } from './FormFieldSelectionInspector'

describe('<FormFieldSelectionInspector />', () => {
  it('muestra acciones de orden para una selección múltiple de casilleros', () => {
    const onAlign = vi.fn()
    const onDistribute = vi.fn()

    render(
      <FormFieldSelectionInspector
        count={3}
        onAlign={onAlign}
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
  })
})
