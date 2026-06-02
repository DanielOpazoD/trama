import type { Task, TaskPriority } from '../../api'
import { weekStartLocal, weekYearMonth } from './notasUtils'

/**
 * Dominio "semana" de Tareas — fuente única de la lógica que antes estaba
 * repetida en TareasView y NotasHomeView (y a medias en el servidor): a qué
 * semana pertenece un recordatorio, el arrastre de pendientes a la semana
 * actual, y el orden dentro de la semana. Todo son funciones puras, así que se
 * testean sin DOM ni red.
 */

const PRIORITY_RANK: Record<TaskPriority, number> = { alta: 0, media: 1, baja: 2 }

/** Semana real ('YYYY-MM-DD', lunes) de una tarea, con red de seguridad: si por
 *  datos viejos faltara `weekStart`, se deriva de su fecha de creación. */
export function rawTaskWeek(task: Pick<Task, 'weekStart' | 'createdAt'>): string {
  if (task.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(task.weekStart)) return task.weekStart
  const d = task.createdAt ? new Date(task.createdAt) : new Date()
  return weekStartLocal(Number.isNaN(d.getTime()) ? new Date() : d)
}

/** Semana EFECTIVA: un pendiente de una semana anterior se arrastra a la semana
 *  actual (`todayWeek`) hasta completarse; las hechas quedan en su semana. */
export function effectiveWeek(task: Task, todayWeek: string): string {
  const wk = rawTaskWeek(task)
  return !task.done && wk < todayWeek ? todayWeek : wk
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
export function groupTasksByWeek(tasks: Task[], todayWeek: string): Map<string, Task[]> {
  const map = new Map<string, Task[]>()
  for (const t of tasks) {
    const wk = effectiveWeek(t, todayWeek)
    const arr = map.get(wk) ?? []
    arr.push(t)
    map.set(wk, arr)
  }
  return map
}

/** Separa los ítems de una semana en pendientes (ordenados) y hechas (ordenadas). */
export function splitByStatus(items: Task[]): { pending: Task[]; done: Task[] } {
  return {
    pending: items.filter((t) => !t.done).sort(byPriorityThenRecency),
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
