import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { GraphLoadingState } from './GraphLoadingState'

describe('<GraphLoadingState />', () => {
  it('muestra el estado de espera sereno del grafo', () => {
    render(<GraphLoadingState />)
    expect(screen.getByRole('status', { name: /tejiendo el grafo/i })).toBeInTheDocument()
    expect(screen.getByText('tejiendo el grafo…')).toBeInTheDocument()
  })
})
