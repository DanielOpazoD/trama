import { afterEach, describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { useWorldThemeClass } from './useWorldThemeClass'
import type { World } from '../types/world'

function Probe({ world }: { world: World }) {
  useWorldThemeClass(world)
  return null
}

afterEach(() => {
  document.documentElement.classList.remove('world-notas', 'world-trama', 'dark')
})

describe('useWorldThemeClass', () => {
  it('notas agrega world-notas y quita world-trama', () => {
    render(<Probe world="notas" />)
    const cl = document.documentElement.classList
    expect(cl.contains('world-notas')).toBe(true)
    expect(cl.contains('world-trama')).toBe(false)
  })

  it('trama agrega world-trama y quita world-notas', () => {
    render(<Probe world="trama" />)
    const cl = document.documentElement.classList
    expect(cl.contains('world-trama')).toBe(true)
    expect(cl.contains('world-notas')).toBe(false)
  })

  it('alterna al cambiar de mundo', () => {
    const { rerender } = render(<Probe world="notas" />)
    expect(document.documentElement.classList.contains('world-notas')).toBe(true)
    rerender(<Probe world="trama" />)
    const cl = document.documentElement.classList
    expect(cl.contains('world-notas')).toBe(false)
    expect(cl.contains('world-trama')).toBe(true)
  })

  it('no pisa la clase de tema (dark) — compone con ella', () => {
    document.documentElement.classList.add('dark')
    render(<Probe world="notas" />)
    const cl = document.documentElement.classList
    expect(cl.contains('dark')).toBe(true)
    expect(cl.contains('world-notas')).toBe(true)
  })

  it('al desmontar limpia las clases de mundo', () => {
    const { unmount } = render(<Probe world="notas" />)
    expect(document.documentElement.classList.contains('world-notas')).toBe(true)
    unmount()
    expect(document.documentElement.classList.contains('world-notas')).toBe(false)
  })
})
