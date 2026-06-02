import { request } from './request'

export type Prompt = {
  id: string
  title: string
  content: string
  collection: string | null
  tags: string[]
  variables: string[]
  favorite: boolean
  useCount: number
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

type PromptRow = {
  id: string
  title: string
  content: string
  collection: string | null
  tags: string[] | null
  variables: string[] | null
  favorite: boolean
  use_count: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

function promptFromRow(row: PromptRow): Prompt {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    collection: row.collection,
    tags: row.tags ?? [],
    variables: row.variables ?? [],
    favorite: row.favorite,
    useCount: row.use_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export type PromptCreate = {
  title: string
  content: string
  collection?: string | null
  favorite?: boolean
}

export type PromptPatch = Partial<PromptCreate> & {
  useCount?: number
}

export const promptsApi = {
  async list(opts?: {
    q?: string
    tag?: string
    collection?: string
  }): Promise<Prompt[]> {
    const params = new URLSearchParams()
    if (opts?.q) params.set('q', opts.q)
    if (opts?.tag) params.set('tag', opts.tag)
    if (opts?.collection) params.set('collection', opts.collection)
    const qs = params.toString()
    const rows = await request<PromptRow[]>(`/api/prompts${qs ? `?${qs}` : ''}`)
    return rows.map(promptFromRow)
  },
  async create(input: PromptCreate): Promise<Prompt> {
    const row = await request<PromptRow>('/api/prompts', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return promptFromRow(row)
  },
  async update(id: string, patch: PromptPatch): Promise<Prompt> {
    const row = await request<PromptRow>(`/api/prompts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    return promptFromRow(row)
  },
  async duplicate(id: string): Promise<Prompt> {
    const row = await request<PromptRow>(`/api/prompts/${id}/duplicate`, {
      method: 'POST',
    })
    return promptFromRow(row)
  },
  async markUsed(id: string): Promise<Prompt> {
    const row = await request<PromptRow>(`/api/prompts/${id}/use`, { method: 'POST' })
    return promptFromRow(row)
  },
  async remove(id: string): Promise<void> {
    await request(`/api/prompts/${id}`, { method: 'DELETE' })
  },
}
