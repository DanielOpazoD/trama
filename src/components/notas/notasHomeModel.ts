import type { Note, Prompt, Task } from '../../api'
import { rawTaskWeek, sortPending } from './weekModel'

type NotasHomeDailySummary = {
  pendingCount: number
  inheritedCount: number
  criticalCount: number
  pinnedCount: number
  headline: string
  subline: string
}

type NotasHomeInboxNote = Note & {
  reason: 'sin etiquetas' | 'vía WhatsApp' | 'con adjuntos'
}

type NotasHomeSectionCounts = {
  currentTasks: number
  inheritedTasks: number
  noteInbox: number
  topNotes: number
  topPrompts: number
}

export type NotasHomeModel = {
  daily: NotasHomeDailySummary
  sectionCounts: NotasHomeSectionCounts
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
  const inheritedTasksAll = pendingTasks.filter((task) => rawTaskWeek(task) < todayWeek)
  const currentTasksAll = pendingTasks.filter((task) => rawTaskWeek(task) >= todayWeek)
  const criticalTasks = pendingTasks.filter((task) => task.priority === 'alta')
  const pinnedNotesAll = notes.filter((note) => note.pinned)
  const topNotesAll = [...notes]
    .filter((note) => !note.promotedMomentoId && !isNoteInboxCandidate(note))
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        b.createdAt.localeCompare(a.createdAt),
    )
  const noteInboxAll = buildNoteInbox(notes)
  const topPromptsAll = [...prompts].sort(
    (a, b) =>
      Number(b.favorite) - Number(a.favorite) ||
      b.useCount - a.useCount ||
      b.updatedAt.localeCompare(a.updatedAt),
  )

  return {
    daily: {
      pendingCount: pendingTasks.length,
      inheritedCount: inheritedTasksAll.length,
      criticalCount: criticalTasks.length,
      pinnedCount: pinnedNotesAll.length,
      headline: formatDailyHeadline({
        pendingCount: pendingTasks.length,
        inheritedCount: inheritedTasksAll.length,
        criticalCount: criticalTasks.length,
      }),
      subline: formatDailySubline({
        noteInboxCount: noteInboxAll.length,
        pinnedCount: pinnedNotesAll.length,
      }),
    },
    sectionCounts: {
      currentTasks: currentTasksAll.length,
      inheritedTasks: inheritedTasksAll.length,
      noteInbox: noteInboxAll.length,
      topNotes: topNotesAll.length,
      topPrompts: topPromptsAll.length,
    },
    pendingPreview,
    currentTasks: currentTasksAll.slice(0, 5),
    inheritedTasks: inheritedTasksAll.slice(0, 5),
    criticalTasks,
    pinnedNotes: pinnedNotesAll.slice(0, 3),
    topNotes: topNotesAll.slice(0, 4),
    noteInbox: noteInboxAll.slice(0, 4),
    topPrompts: topPromptsAll.slice(0, 4),
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
}

function isNoteInboxCandidate(note: Note): boolean {
  return !note.pinned && !note.promotedMomentoId && noteInboxReason(note) !== null
}

function noteInboxReason(note: Note): NotasHomeInboxNote['reason'] | null {
  if (note.tags.length > 0) return null
  if (note.source === 'whatsapp') return 'vía WhatsApp'
  if (note.hasAudio || note.hasImages) return 'con adjuntos'
  return 'sin etiquetas'
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
