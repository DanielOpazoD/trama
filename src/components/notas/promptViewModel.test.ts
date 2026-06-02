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
