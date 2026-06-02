import type { Prompt } from '../../api'

export type PromptViewModel = {
  activeFilter: string | null
  collections: string[]
  filtered: Prompt[]
  stats: {
    total: number
    favorites: number
    collections: number
    totalUses: number
  }
}

export function buildPromptViewModel(
  prompts: Prompt[],
  filter: string | null,
): PromptViewModel {
  const collections = [
    ...new Set(prompts.map((prompt) => prompt.collection).filter(Boolean) as string[]),
  ].sort((a, b) => a.localeCompare(b, 'es'))
  const activeFilter = filter && collections.includes(filter) ? filter : null
  return {
    activeFilter,
    collections,
    filtered: activeFilter
      ? prompts.filter((prompt) => prompt.collection === activeFilter)
      : prompts,
    stats: {
      total: prompts.length,
      favorites: prompts.filter((prompt) => prompt.favorite).length,
      collections: collections.length,
      totalUses: prompts.reduce((sum, prompt) => sum + prompt.useCount, 0),
    },
  }
}
