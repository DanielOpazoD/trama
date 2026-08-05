import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useMediaReveal } from './useMediaReveal'

describe('useMediaReveal', () => {
  it('cargando: opacidad plena y placeholder visible (como siempre)', () => {
    const { result } = renderHook(() => useMediaReveal(false))
    expect(result.current.revealClass).toContain('opacity-100')
    expect(result.current.revealClass).not.toContain('animate-media-reveal')
    expect(result.current.showPlaceholder).toBe(true)
  })

  it('al resolver: funde a opacidad 1 con transición y LUEGO suelta el placeholder', async () => {
    const { result, rerender } = renderHook(({ ready }) => useMediaReveal(ready), {
      initialProps: { ready: false },
    })

    rerender({ ready: true })

    // Fundido por KEYFRAME (no transition: los tiles con hover-zoom ya usan
    // transition-transform y la pelea por transition-property mataría el
    // fundido). El placeholder sigue pintado: la imagen funde sobre él.
    await waitFor(() => {
      expect(result.current.revealClass).toContain('animate-media-reveal')
    })
    expect(result.current.revealClass).toContain('opacity-100')
    expect(result.current.revealClass).toContain('motion-reduce:animate-none')
    expect(result.current.showPlaceholder).toBe(true)

    // Terminada la transición, el placeholder se suelta (importante para
    // object-contain: un fondo permanente pintaría el letterbox).
    await waitFor(() => expect(result.current.showPlaceholder).toBe(false), {
      timeout: 1500,
    })
  })

  it('si la key cambia (ready vuelve a false), se reinicia a waiting', async () => {
    const { result, rerender } = renderHook(({ ready }) => useMediaReveal(ready), {
      initialProps: { ready: true },
    })
    await waitFor(() => expect(result.current.showPlaceholder).toBe(false), {
      timeout: 1500,
    })

    rerender({ ready: false })

    expect(result.current.showPlaceholder).toBe(true)
    expect(result.current.revealClass).toContain('opacity-100')
  })
})
