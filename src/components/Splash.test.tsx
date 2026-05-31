import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Splash } from './Splash'

describe('<Splash />', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-31T10:00:00-04:00'))
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('muestra saludo, marca y aforismo la primera vez de la sesión', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)

    render(<Splash />)

    expect(screen.getByText('Buenos días')).toBeInTheDocument()
    expect(screen.getByText('mapa cognitivo personal')).toBeInTheDocument()
    expect(screen.getByText('Trama')).toBeInTheDocument()
    expect(screen.getByText('hilo a hilo')).toBeInTheDocument()
  })

  it('prefiere el hilo del día cacheado y marca el splash como visto', () => {
    window.localStorage.setItem('trama:hilo-date', '2026-05-31')
    window.localStorage.setItem('trama:hilo-text', 'hace un año guardaste una cita')

    render(<Splash />)

    expect(screen.getByText('hace un año guardaste una cita')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1900)
    })

    expect(screen.queryByText('Trama')).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem('trama:splash-seen')).toBe('1')
  })

  it('no renderiza si la sesión ya vio el splash', () => {
    window.sessionStorage.setItem('trama:splash-seen', '1')

    render(<Splash />)

    expect(screen.queryByText('Trama')).not.toBeInTheDocument()
  })
})
