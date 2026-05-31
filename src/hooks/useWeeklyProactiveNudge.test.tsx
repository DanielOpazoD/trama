import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWeeklyProactiveNudge } from './useWeeklyProactiveNudge'

const stateMocks = vi.hoisted(() => ({
  show: vi.fn(),
  useProactiveQuery: vi.fn(),
}))

vi.mock('../state', () => ({
  useToast: () => ({ show: stateMocks.show }),
  useProactiveQuery: stateMocks.useProactiveQuery,
}))

describe('useWeeklyProactiveNudge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-31T12:00:00Z'))
    window.localStorage.clear()
    stateMocks.show.mockReset()
    stateMocks.useProactiveQuery.mockReset()
  })

  it('muestra un toast semanal para propuestas pendientes y navega desde la acción', () => {
    const onNavigate = vi.fn()
    stateMocks.useProactiveQuery.mockReturnValue({
      data: [{ id: 'p1' }, { id: 'p2' }],
      isLoading: false,
      isError: false,
    })

    renderHook(() => useWeeklyProactiveNudge({ onNavigate }))

    expect(stateMocks.show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Tienes 2 propuestas de la IA esperando que las mires.',
        action: expect.objectContaining({ label: 'Ver' }),
      }),
    )

    stateMocks.show.mock.calls[0]?.[0].action.onAction()
    expect(onNavigate).toHaveBeenCalledOnce()
    expect(window.localStorage.getItem('trama:proactive-last-nudge')).toBe(
      String(Date.now()),
    )
  })

  it('no repite si el último nudge es reciente o si la query no está lista', () => {
    window.localStorage.setItem('trama:proactive-last-nudge', String(Date.now()))
    stateMocks.useProactiveQuery.mockReturnValue({
      data: [{ id: 'p1' }],
      isLoading: false,
      isError: false,
    })

    renderHook(() => useWeeklyProactiveNudge({ onNavigate: () => {} }))

    expect(stateMocks.show).not.toHaveBeenCalled()

    stateMocks.useProactiveQuery.mockReturnValue({
      data: [{ id: 'p1' }],
      isLoading: true,
      isError: false,
    })
    renderHook(() => useWeeklyProactiveNudge({ onNavigate: () => {} }))

    expect(stateMocks.show).not.toHaveBeenCalled()
  })
})
