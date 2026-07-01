import type { Task, TaskPriority, TaskCategory } from '../../api'
import { weekStartLocal, weekYearMonth } from './notasUtils'

/**
 * Dominio "semana" de Tareas — fuente única de la lógica que antes estaba
 * repetida en TareasView y NotasHomeView (y a medias en el servidor): a qué
 * semana pertenece un recordatorio, el arrastre de pendientes al anchor visible,
 * y el orden dentro de la semana. Todo son funciones puras, así que se testean
 * sin DOM ni red.
 */

const PRIORITY_RANK: Record<TaskPriority, number> = { alta: 0, media: 1, baja: 2 }

/** Semana real ('YYYY-MM-DD', lunes) de una tarea, con red de seguridad: si por
 *  datos viejos faltara `weekStart`, se deriva de su fecha de creación. */
export function rawTaskWeek(task: Pick<Task, 'weekStart' | 'createdAt'>): string {
  if (task.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(task.weekStart)) return task.weekStart
  const d = task.createdAt ? new Date(task.createdAt) : new Date()
  return weekStartLocal(Number.isNaN(d.getTime()) ? new Date() : d)
}

/** Semana EFECTIVA: un pendiente de una semana anterior se arrastra al anchor
 * visible (`anchorWeek`) hasta completarse; las hechas quedan en su semana. */
export function effectiveWeek(task: Task, anchorWeek: string): string {
  const wk = rawTaskWeek(task)
  return !task.done && wk < anchorWeek ? anchorWeek : wk
}

/** Semana visible que debe recibir los pendientes antiguos.
 *
 * - Mes actual: la semana actual.
 * - Mes futuro: el primer lunes visible de ese mes/año.
 * - Mes pasado: null, para no reinyectar pendientes hacia el historial.
 */
export function rolloverAnchorForVisibleWeeks(
  weekKeys: string[],
  todayWeek: string,
): string | null {
  if (weekKeys.length === 0) return null
  const ordered = [...weekKeys].sort()
  const first = ordered[0]!
  const last = ordered[ordered.length - 1]!

  if (todayWeek < first) return first
  if (todayWeek <= last) return weekKeys.includes(todayWeek) ? todayWeek : first
  return null
}

/** Orden de pendientes: prioridad (alta→media→baja), luego más recientes. */
export function byPriorityThenRecency(a: Task, b: Task): number {
  return (
    (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) ||
    b.createdAt.localeCompare(a.createdAt)
  )
}

/** Orden de hechas: lo más reciente primero (por completado o creación). */
function byCompletion(a: Task, b: Task): number {
  return (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt)
}

/** Agrupa tareas por su semana efectiva (con el arrastre ya aplicado). */
export function groupTasksByWeek(tasks: Task[], anchorWeek: string): Map<string, Task[]> {
  const map = new Map<string, Task[]>()
  for (const t of tasks) {
    const wk = effectiveWeek(t, anchorWeek)
    const arr = map.get(wk) ?? []
    arr.push(t)
    map.set(wk, arr)
  }
  return map
}

/** Cómo ordenar los pendientes dentro de la semana. */
export type SortMode = 'priority' | 'created' | 'tag'

const PENDING_COMPARATORS: Record<SortMode, (a: Task, b: Task) => number> = {
  priority: byPriorityThenRecency,
  // Por fecha de ingreso: lo primero anotado, arriba.
  created: (a, b) => a.createdAt.localeCompare(b.createdAt),
  // Por etiqueta (primera #tag, alfabético); a igualdad, por prioridad.
  tag: (a, b) =>
    (a.tags[0] ?? '￿').localeCompare(b.tags[0] ?? '￿') || byPriorityThenRecency(a, b),
}

/** Separa los ítems de una semana en pendientes (ordenados según `sortMode`) y
 *  hechas (lo más reciente primero). */
export function splitByStatus(
  items: Task[],
  sortMode: SortMode = 'priority',
): { pending: Task[]; done: Task[] } {
  return {
    pending: items.filter((t) => !t.done).sort(PENDING_COMPARATORS[sortMode]),
    done: items.filter((t) => t.done).sort(byCompletion),
  }
}

/** Meses (0–11) del año `year` con algún pendiente — para el punto del navegador. */
export function pendingMonthsForYear(
  tasks: Task[],
  year: number,
  todayWeek: string,
): Set<number> {
  const set = new Set<number>()
  for (const t of tasks) {
    if (t.done) continue
    const { year: y, month0 } = weekYearMonth(effectiveWeek(t, todayWeek))
    if (y === year) set.add(month0)
  }
  return set
}

/** Pendientes ordenados por prioridad — para listas tipo "Pendientes" (home). */
export function sortPending(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.done).sort(byPriorityThenRecency)
}

/**
 * Categoría por defecto: las tareas sin clasificar (las antiguas, anteriores a
 * la columna `category`) se consideran de trabajo. Único lugar donde vive este
 * fallback, para no repetir el literal por toda la app.
 */
export const DEFAULT_CATEGORY: TaskCategory = 'trabajo'

/** Categoría de una tarea, con red de seguridad para datos viejos sin `category`. */
export function taskCategory(task: Pick<Task, 'category'>): TaskCategory {
  return task.category ?? DEFAULT_CATEGORY
}

/** Filtra los ítems de un cuadro por la pestaña activa (Trabajo / Personal). */
export function filterByCategory<T extends Pick<Task, 'category'>>(
  items: T[],
  category: TaskCategory,
): T[] {
  return items.filter((t) => taskCategory(t) === category)
}

/** Pendientes por categoría — alimenta el contador discreto de la pestaña inactiva. */
export function countPendingByCategory(
  items: Pick<Task, 'category' | 'done'>[],
): Record<TaskCategory, number> {
  const counts: Record<TaskCategory, number> = { trabajo: 0, personal: 0 }
  for (const t of items) {
    if (!t.done) counts[taskCategory(t)]++
  }
  return counts
}
