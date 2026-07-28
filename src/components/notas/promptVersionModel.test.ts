import { describe, expect, it } from 'vitest'
import type { Prompt, PromptVersion } from '../../api'
import {
  buildVersionEntries,
  describirCambios,
  fechaDeVersion,
} from './promptVersionModel'

function prompt(over: Partial<Prompt> = {}): Prompt {
  return {
    id: 'p1',
    title: 'Sintetizar',
    content: 'Resume {{tema}}',
    collection: 'Investigación',
    tags: [],
    variables: ['tema'],
    favorite: false,
    useCount: 0,
    lastUsedAt: null,
    createdAt: '2026-07-01T10:00:00Z',
    updatedAt: '2026-07-20T10:00:00Z',
    ...over,
  }
}

function version(id: string, over: Partial<PromptVersion> = {}): PromptVersion {
  return {
    id,
    title: 'Sintetizar',
    content: 'Resume {{tema}}',
    collection: 'Investigación',
    createdAt: '2026-07-10T10:00:00Z',
    ...over,
  }
}

describe('buildVersionEntries', () => {
  /**
   * Cada fila guarda el estado ANTERIOR a una edición, así que lo que esa
   * edición cambió sólo se ve comparando con lo que vino DESPUÉS. Confundir la
   * dirección haría que el historial señale siempre el campo equivocado.
   */
  it('compara cada versión con lo que vino después, no con lo anterior', () => {
    const actual = prompt({ content: 'Resume {{tema}} en tres frases' })
    const entradas = buildVersionEntries(actual, [
      version('v2', { content: 'Resume {{tema}}' }), // la reemplazó el actual
      version('v1', { title: 'Resumir' }), // la reemplazó v2
    ])

    expect(entradas[0]!.cambios).toEqual(['contenido'])
    expect(entradas[1]!.cambios).toEqual(['título'])
  })

  it('reconoce varios campos en una misma edición', () => {
    const actual = prompt({ title: 'Sintetizar mejor', collection: null })
    const entradas = buildVersionEntries(actual, [version('v1')])

    expect(entradas[0]!.cambios).toEqual(['título', 'colección'])
  })

  /**
   * Tras restaurar, la versión restaurada y el prompt coinciden. Marcarlo evita
   * ofrecer un "restaurar" que no haría nada.
   */
  it('marca la versión idéntica al prompt actual', () => {
    const actual = prompt()
    const entradas = buildVersionEntries(actual, [
      version('v2'), // idéntica al actual
      version('v1', { content: 'Otro texto' }),
    ])

    expect(entradas[0]!.igualAlActual).toBe(true)
    expect(entradas[1]!.igualAlActual).toBe(false)
  })

  it('distingue colección vacía de colección ausente', () => {
    const actual = prompt({ collection: null })
    const entradas = buildVersionEntries(actual, [version('v1', { collection: '' })])

    expect(entradas[0]!.cambios).toEqual(['colección'])
  })

  it('sin historial no hay entradas', () => {
    expect(buildVersionEntries(prompt(), [])).toEqual([])
  })
})

describe('describirCambios', () => {
  it('enumera en castellano', () => {
    expect(describirCambios(['contenido'])).toBe('contenido')
    expect(describirCambios(['título', 'colección'])).toBe('título y colección')
    expect(describirCambios(['título', 'contenido', 'colección'])).toBe(
      'título, contenido y colección',
    )
  })

  it('dice explícitamente cuando no cambió el texto', () => {
    expect(describirCambios([])).toBe('sin cambios de texto')
  })
})

describe('fechaDeVersion', () => {
  it('devuelve día, mes y hora', () => {
    const salida = fechaDeVersion('2026-07-14T09:32:00Z')
    expect(salida).toMatch(/14/)
    expect(salida).toMatch(/jul/i)
  })

  it('una fecha inválida no rompe la fila', () => {
    expect(fechaDeVersion('no es una fecha')).toBe('')
  })
})
