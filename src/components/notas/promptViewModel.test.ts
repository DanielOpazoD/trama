import { describe, expect, it } from 'vitest'
import type { Prompt } from '../../api'
import { buildPromptViewModel } from './promptViewModel'

const basePrompt: Prompt = {
  id: 'p1',
  title: 'Base',
  content: 'Prompt',
  collection: null,
  tags: [],
  variables: [],
  favorite: false,
  useCount: 0,
  lastUsedAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}

describe('buildPromptViewModel', () => {
  it('normaliza colecciones, filtros y métricas para la vista de prompts', () => {
    const prompts: Prompt[] = [
      { ...basePrompt, id: 'p1', title: 'A', collection: 'Código', favorite: true },
      { ...basePrompt, id: 'p2', title: 'B', collection: 'Ventas', useCount: 4 },
      { ...basePrompt, id: 'p3', title: 'C', collection: 'Código', useCount: 2 },
      { ...basePrompt, id: 'p4', title: 'D', collection: null },
    ]

    const model = buildPromptViewModel(prompts, 'Código')

    expect(model.collections).toEqual(['Código', 'Ventas'])
    expect(model.filtered.map((prompt) => prompt.id)).toEqual(['p1', 'p3'])
    expect(model.stats).toEqual({
      total: 4,
      favorites: 1,
      collections: 2,
      totalUses: 6,
    })
  })

  it('ignora filtros que ya no existen para no dejar la vista vacía accidentalmente', () => {
    const model = buildPromptViewModel(
      [{ ...basePrompt, id: 'p1', collection: 'Investigación' }],
      'Ventas',
    )

    expect(model.activeFilter).toBeNull()
    expect(model.filtered.map((prompt) => prompt.id)).toEqual(['p1'])
  })
})

describe('buildPromptViewModel — búsqueda', () => {
  const biblioteca = [
    {
      ...basePrompt,
      id: 'a',
      title: 'Síntesis de lectura',
      content: 'Lee {{texto}} y dame la tesis',
      collection: 'Investigación',
      variables: ['texto'],
    },
    {
      ...basePrompt,
      id: 'b',
      title: 'Reescribir sin adjetivos',
      content: 'Quita los adjetivos de {{parrafo}}',
      collection: 'Escritura',
      variables: ['parrafo'],
    },
  ]

  /** Exigir la tilde exacta convertiría el buscador en un examen de ortografía. */
  it('ignora tildes y mayúsculas', () => {
    expect(buildPromptViewModel(biblioteca, null, 'SINTESIS').filtered).toHaveLength(1)
    expect(buildPromptViewModel(biblioteca, null, 'síntesis').filtered).toHaveLength(1)
  })

  it('busca también en contenido, colección y variables', () => {
    expect(buildPromptViewModel(biblioteca, null, 'tesis').filtered[0]?.id).toBe('a')
    expect(buildPromptViewModel(biblioteca, null, 'escritura').filtered[0]?.id).toBe('b')
    expect(buildPromptViewModel(biblioteca, null, 'parrafo').filtered[0]?.id).toBe('b')
  })

  it('todos los términos deben aparecer, en cualquier orden y campo', () => {
    expect(
      buildPromptViewModel(biblioteca, null, 'lectura investigación').filtered,
    ).toHaveLength(1)
    expect(
      buildPromptViewModel(biblioteca, null, 'lectura escritura').filtered,
    ).toHaveLength(0)
  })

  it('la búsqueda se combina con el filtro de colección', () => {
    expect(
      buildPromptViewModel(biblioteca, 'Escritura', 'adjetivos').filtered,
    ).toHaveLength(1)
    expect(buildPromptViewModel(biblioteca, 'Escritura', 'tesis').filtered).toHaveLength(
      0,
    )
  })

  /**
   * Si las métricas siguieran a la búsqueda dejarían de ser una referencia:
   * describen la biblioteca, no el resultado de filtrarla.
   */
  it('las métricas no cambian al buscar', () => {
    const vm = buildPromptViewModel(biblioteca, null, 'sintesis')
    expect(vm.filtered).toHaveLength(1)
    expect(vm.stats.total).toBe(2)
    expect(vm.stats.collections).toBe(2)
  })

  it('sólo espacios no cuenta como búsqueda', () => {
    const vm = buildPromptViewModel(biblioteca, null, '   ')
    expect(vm.searching).toBe(false)
    expect(vm.filtered).toHaveLength(2)
  })
})
