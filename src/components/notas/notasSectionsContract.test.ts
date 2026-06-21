import { describe, expect, it } from 'vitest'
import { SECTIONS } from './NotasWorldChrome'
import { NOTAS_SECTIONS } from '../../types/notas'

describe('Notas sections contract', () => {
  it('mantiene una única allowlist para chrome y deep links', () => {
    expect(SECTIONS.map((section) => section.id)).toEqual(NOTAS_SECTIONS)
    expect(NOTAS_SECTIONS).toEqual([
      'inicio',
      'notas',
      'tareas',
      'prompts',
      'claves',
      'pdf',
      'planillas',
      'biblioteca',
    ])
  })
})
