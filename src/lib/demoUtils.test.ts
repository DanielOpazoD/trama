import { afterEach, describe, expect, it, vi } from 'vitest'

import { dateAgo, extractPromptVariables, parseTags, weekStartAgo } from './demoUtils'

describe('demoUtils', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('deriva tags únicos en minúscula desde texto libre', () => {
    expect(parseTags('Idea sobre #Memoria y #memoria; seguir #Rayuela_63')).toEqual([
      'memoria',
      'rayuela_63',
    ])
  })

  it('extrae variables de prompt sin duplicados', () => {
    expect(
      extractPromptVariables('Hola {{ nombre }}. Repite {{nombre}} en {{ tono_2 }}.'),
    ).toEqual(['nombre', 'tono_2'])
  })

  it('calcula fechas demo relativas y semana local desde lunes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-10T12:00:00'))

    expect(dateAgo(2)).toBe('2026-06-08')
    expect(dateAgo(-2)).toBe('2026-06-12')
    expect(weekStartAgo(0)).toBe('2026-06-08')
    expect(weekStartAgo(7)).toBe('2026-06-01')
  })
})
