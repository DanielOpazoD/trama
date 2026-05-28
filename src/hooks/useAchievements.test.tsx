import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

/**
 * Tests para δ7: achievement moments. Mockeamos el módulo de toast
 * directamente para capturar las llamadas sin depender del provider
 * real (que pinta DOM y compite con el timing del useEffect).
 */

// Spy del toast.show — accesible desde cada test.
const toastShow = vi.fn()

vi.mock('../state', () => ({
  useToast: () => ({
    show: toastShow,
    dismiss: vi.fn(),
  }),
}))

// Importamos DESPUÉS del mock para que el hook resuelva al mock.
const { useAchievements } = await import('./useAchievements')

const STORAGE_KEY = 'trama:achievements-seen'

function wrap({ children }: { children: ReactNode }) {
  return <>{children}</>
}

beforeEach(() => {
  window.localStorage.clear()
  toastShow.mockReset()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('useAchievements', () => {
  it('no dispara nada con todos los counts en 0 (data no cargó)', () => {
    renderHook(() => useAchievements({ entities: 0, quotes: 0, relationships: 0 }), {
      wrapper: wrap,
    })
    expect(toastShow).not.toHaveBeenCalled()
  })

  it('dispara un toast cuando se cruza el umbral 10 de entidades', () => {
    renderHook(() => useAchievements({ entities: 10, quotes: 0, relationships: 0 }), {
      wrapper: wrap,
    })
    expect(toastShow).toHaveBeenCalledTimes(1)
    const call = toastShow.mock.calls[0]![0] as { message: string; tone?: string }
    expect(call.message).toMatch(/diez entidades/i)
    expect(call.tone).toBe('achievement')
  })

  it('graba el umbral en localStorage para no re-disparar', () => {
    renderHook(() => useAchievements({ entities: 10, quotes: 0, relationships: 0 }), {
      wrapper: wrap,
    })
    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    const seen = JSON.parse(raw!) as string[]
    expect(seen).toContain('entities-10')
  })

  it('si ya está en seen, NO re-dispara el toast', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['entities-10']))
    renderHook(() => useAchievements({ entities: 10, quotes: 0, relationships: 0 }), {
      wrapper: wrap,
    })
    expect(toastShow).not.toHaveBeenCalled()
  })

  it('cruza varios umbrales en un render — solo dispara el mayor', () => {
    // 250 entidades cruzaría 10, 25, 50, 100, 250 todos a la vez.
    renderHook(() => useAchievements({ entities: 250, quotes: 0, relationships: 0 }), {
      wrapper: wrap,
    })
    expect(toastShow).toHaveBeenCalledTimes(1)
    const call = toastShow.mock.calls[0]![0] as { message: string }
    // El mayor (250) debe estar en el message.
    expect(call.message).toMatch(/doscientas cincuenta|250/i)

    // Pero los menores también se graban como vistos.
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const seen = JSON.parse(raw!) as string[]
    expect(seen).toContain('entities-10')
    expect(seen).toContain('entities-25')
    expect(seen).toContain('entities-100')
    expect(seen).toContain('entities-250')
  })

  it('mide independiente cada categoría (entities, quotes, relationships)', () => {
    renderHook(() => useAchievements({ entities: 10, quotes: 10, relationships: 10 }), {
      wrapper: wrap,
    })
    // 3 categorías cruzando umbral simultáneamente → la última iteración
    // gana (Object.entries order). Lo importante: las 3 keys se graban.
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const seen = JSON.parse(raw!) as string[]
    expect(seen).toContain('entities-10')
    expect(seen).toContain('quotes-10')
    expect(seen).toContain('relationships-10')
  })
})
