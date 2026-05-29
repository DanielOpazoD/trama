import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../test-utils'
import { GabineteView } from './GabineteView'

describe('<GabineteView />', () => {
  it('renderiza los cinco gestos literarios', () => {
    renderWithProviders(
      <GabineteView onSortes={() => {}} onEspejo={() => {}} onNavigate={() => {}} />,
    )
    for (const name of ['Sortes', 'Espejo', 'Voz de…', 'Hojas sueltas', 'Postales']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it('lanza Sortes y Espejo directo (overlays con estado en App)', () => {
    const onSortes = vi.fn()
    const onEspejo = vi.fn()
    renderWithProviders(
      <GabineteView onSortes={onSortes} onEspejo={onEspejo} onNavigate={() => {}} />,
    )
    fireEvent.click(screen.getByText('Sortes').closest('button')!)
    expect(onSortes).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Espejo').closest('button')!)
    expect(onEspejo).toHaveBeenCalledTimes(1)
  })

  it('navega al contexto para los gestos que lo requieren', () => {
    const onNavigate = vi.fn()
    renderWithProviders(
      <GabineteView onSortes={() => {}} onEspejo={() => {}} onNavigate={onNavigate} />,
    )
    fireEvent.click(screen.getByText('Voz de…').closest('button')!)
    expect(onNavigate).toHaveBeenCalledWith('entidades')
    fireEvent.click(screen.getByText('Hojas sueltas').closest('button')!)
    expect(onNavigate).toHaveBeenCalledWith('momentos')
    fireEvent.click(screen.getByText('Postales').closest('button')!)
    expect(onNavigate).toHaveBeenCalledWith('citas')
  })
})
