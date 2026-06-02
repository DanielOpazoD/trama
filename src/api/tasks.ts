/**
 * Trama Notas — cliente de Tareas (pendientes). Transforma snake→camel en la
 * frontera (como el resto de src/api). Las etiquetas las deriva el server de
 * título+detalle.
 */
import { request } from './request'

/** Prioridad de un recordatorio — da el color (alta · media · baja). */
export type TaskPriority = 'alta' | 'media' | 'baja'

export type Task = {
  id: string
  title: string
  detail: string | null
  done: boolean
  /** Vencimiento opcional como 'YYYY-MM-DD', o null. */
  dueDate: string | null
  /** Color de prioridad del recordatorio. */
  priority: TaskPriority
  /** Lunes ('YYYY-MM-DD') de la semana a la que pertenece el recordatorio. */
  weekStart: string
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
  priority: string
  week_start: string
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
    priority: (r.priority as TaskPriority) ?? 'media',
    weekStart: r.week_start,
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
  priority?: TaskPriority
  weekStart?: string
}

export type TaskPatch = {
  title?: string
  detail?: string | null
  done?: boolean
  dueDate?: string | null
  priority?: TaskPriority
  weekStart?: string
}

export type TaskListOpts = {
  q?: string
  tag?: string
  /** Solo pendientes (para listas tipo "Pendientes"). */
  pending?: boolean
  /** Rango de semanas (lunes 'YYYY-MM-DD') — carga acotada. */
  weekFrom?: string
  weekTo?: string
  /** Trae además los pendientes anteriores a esta fecha (arrastre). */
  carryBefore?: string | null
}

export const tasksApi = {
  /** Lista tareas. Sin opts trae todo; con `pending` o `weekFrom`/`weekTo` acota. */
  async list(opts?: TaskListOpts): Promise<Task[]> {
    const params = new URLSearchParams()
    if (opts?.q) params.set('q', opts.q)
    if (opts?.tag) params.set('tag', opts.tag)
    if (opts?.pending) params.set('pending', '1')
    if (opts?.weekFrom) params.set('weekFrom', opts.weekFrom)
    if (opts?.weekTo) params.set('weekTo', opts.weekTo)
    if (opts?.carryBefore) params.set('carryBefore', opts.carryBefore)
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
