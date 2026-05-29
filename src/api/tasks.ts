/**
 * Trama Notas — cliente de Tareas (pendientes). Transforma snake→camel en la
 * frontera (como el resto de src/api). Las etiquetas las deriva el server de
 * título+detalle.
 */
import { request } from './request'

export type Task = {
  id: string
  title: string
  detail: string | null
  done: boolean
  /** Vencimiento opcional como 'YYYY-MM-DD', o null. */
  dueDate: string | null
  /** ISO de cuándo se marcó como hecha, o null si pendiente. */
  completedAt: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

type TaskRow = {
  id: string
  title: string
  detail: string | null
  done: boolean
  due_date: string | null
  completed_at: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
}

function taskFromRow(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    detail: r.detail,
    done: r.done,
    dueDate: r.due_date,
    completedAt: r.completed_at,
    tags: r.tags ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export type TaskCreate = {
  title: string
  detail?: string | null
  dueDate?: string | null
}

export type TaskPatch = {
  title?: string
  detail?: string | null
  done?: boolean
  dueDate?: string | null
}

export const tasksApi = {
  /** Lista las tareas del usuario. `q` busca en título/detalle; `tag` filtra. */
  async list(opts?: { q?: string; tag?: string }): Promise<Task[]> {
    const params = new URLSearchParams()
    if (opts?.q) params.set('q', opts.q)
    if (opts?.tag) params.set('tag', opts.tag)
    const qs = params.toString()
    const rows = await request<TaskRow[]>(`/api/tasks${qs ? `?${qs}` : ''}`)
    return rows.map(taskFromRow)
  },
  async create(input: TaskCreate): Promise<Task> {
    const row = await request<TaskRow>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return taskFromRow(row)
  },
  async update(id: string, patch: TaskPatch): Promise<Task> {
    const row = await request<TaskRow>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    return taskFromRow(row)
  },
  async remove(id: string): Promise<void> {
    await request(`/api/tasks/${id}`, { method: 'DELETE' })
  },
}
