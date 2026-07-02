import type { Note, Prompt, Task } from '../../api'
import { rawTaskWeek, sortPending } from './weekModel'

export type NotasHomeDailySummary = {
  pendingCount: number
  inheritedCount: number
  criticalCount: number
  pinnedCount: number
  headline: string
  subline: string
}

export type NotasHomeInboxNote = Note & {
  reason: 'sin etiquetas' | 'vía WhatsApp' | 'con adjuntos'
}

export type NotasHomeModel = {
  daily: NotasHomeDailySummary
  pendingPreview: Task[]
  currentTasks: Task[]
  inheritedTasks: Task[]
  criticalTasks: Task[]
  pinnedNotes: Note[]
  topNotes: Note[]
  noteInbox: NotasHomeInboxNote[]
  topPrompts: Prompt[]
}

export function buildNotasHomeModel({
  notes,
  tasks,
  prompts,
  todayWeek,
}: {
  notes: Note[]
  tasks: Task[]
  prompts: Prompt[]
  todayWeek: string
}): NotasHomeModel {
  const pendingTasks = sortPending(tasks)
  const pendingPreview = pendingTasks.slice(0, 5)
  const inheritedTasks = pendingTasks
    .filter((task) => rawTaskWeek(task) < todayWeek)
    .slice(0, 5)
  const currentTasks = pendingTasks
    .filter((task) => rawTaskWeek(task) >= todayWeek)
    .slice(0, 5)
  const criticalTasks = pendingTasks.filter((task) => task.priority === 'alta')
  const pinnedNotes = notes.filter((note) => note.pinned).slice(0, 3)
  const topNotes = [...notes]
    .filter((note) => !note.promotedMomentoId && !isNoteInboxCandidate(note))
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, 4)
  const noteInbox = buildNoteInbox(notes)
  const topPrompts = [...prompts]
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        b.useCount - a.useCount ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
    .slice(0, 4)

  return {
    daily: {
      pendingCount: pendingTasks.length,
      inheritedCount: inheritedTasks.length,
      criticalCount: criticalTasks.length,
      pinnedCount: pinnedNotes.length,
      headline: formatDailyHeadline({
        pendingCount: pendingTasks.length,
        inheritedCount: inheritedTasks.length,
        criticalCount: criticalTasks.length,
      }),
      subline: formatDailySubline({
        noteInboxCount: noteInbox.length,
        pinnedCount: pinnedNotes.length,
      }),
    },
    pendingPreview,
    currentTasks,
    inheritedTasks,
    criticalTasks,
    pinnedNotes,
    topNotes,
    noteInbox,
    topPrompts,
  }
}

function buildNoteInbox(notes: Note[]): NotasHomeInboxNote[] {
  return notes
    .filter(isNoteInboxCandidate)
    .map((note) => {
      const reason = noteInboxReason(note)
      return reason ? ({ ...note, reason } satisfies NotasHomeInboxNote) : null
    })
    .filter((note): note is NotasHomeInboxNote => note !== null)
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, 4)
}

function isNoteInboxCandidate(note: Note): boolean {
  return !note.pinned && !note.promotedMomentoId && noteInboxReason(note) !== null
}

function noteInboxReason(note: Note): NotasHomeInboxNote['reason'] | null {
  if (note.source === 'whatsapp') return 'vía WhatsApp'
  if (note.tags.length === 0) return 'sin etiquetas'
  if (note.hasAudio || note.hasImages) return 'con adjuntos'
  return null
}

function formatDailyHeadline({
  pendingCount,
  inheritedCount,
  criticalCount,
}: Pick<
  NotasHomeDailySummary,
  'pendingCount' | 'inheritedCount' | 'criticalCount'
>): string {
  const parts = [`${pendingCount} ${pendingCount === 1 ? 'pendiente' : 'pendientes'}`]
  if (inheritedCount > 0) {
    parts.push(`${inheritedCount} ${inheritedCount === 1 ? 'heredada' : 'heredadas'}`)
  }
  if (criticalCount > 0) {
    parts.push(`${criticalCount} ${criticalCount === 1 ? 'crítica' : 'críticas'}`)
  }
  return parts.join(' · ')
}

function formatDailySubline({
  noteInboxCount,
  pinnedCount,
}: {
  noteInboxCount: number
  pinnedCount: number
}): string {
  if (noteInboxCount > 0) {
    return `${noteInboxCount} ${noteInboxCount === 1 ? 'nota reciente espera' : 'notas recientes esperan'} clasificación.`
  }
  if (pinnedCount > 0) {
    return `${pinnedCount} ${pinnedCount === 1 ? 'nota fijada sostiene' : 'notas fijadas sostienen'} el foco.`
  }
  return 'Sin notas fijadas: captura una señal antes de ordenar el día.'
}
