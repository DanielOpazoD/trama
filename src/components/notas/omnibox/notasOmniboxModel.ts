import type { Note, Prompt, Task } from '../../../api'
import type { CommandSearchContentItem } from '../../../hooks/commandSearchModel'
import { normalizeQuery, rankMatches } from '../../../hooks/commandSearchRanking'

/** Desde cuántos caracteres busca el mundo Notas: el mismo umbral que /api/search. */
export const NOTAS_OMNIBOX_MIN_CHARS = 2
/** Filas por grupo: notas, tareas y prompts. */
export const NOTAS_OMNIBOX_GROUP_LIMIT = 5

const PREVIEW_CHARS = 400

function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? ''
  )
}

/**
 * Notas, tareas y prompts como filas del buscador. Puntúa con el mismo ranking
 * que el resto de la paleta, sin tildes: «edicion» encuentra «edición», que el
 * diálogo retirado no encontraba. Un grupo protegido con PIN no aporta nada aunque
 * sus datos estén en caché.
 */
export function buildNotasOmniboxItems({
  text,
  notes,
  tasks,
  prompts,
  hidden,
  actions,
}: {
  text: string
  notes: Note[]
  tasks: Task[]
  prompts: Prompt[]
  hidden: { note: boolean; task: boolean; prompt: boolean }
  actions: { completeTask: (task: Task) => void; copyPrompt: (prompt: Prompt) => void }
}): CommandSearchContentItem[] {
  const q = normalizeQuery(text)
  if (q.length < NOTAS_OMNIBOX_MIN_CHARS) return []

  const noteItems = hidden.note
    ? []
    : rankMatches(
        notes,
        q,
        (note) => [
          { text: note.title ?? '', weight: 120 },
          { text: note.content, weight: 100 },
        ],
        (note): CommandSearchContentItem => ({
          kind: 'content',
          id: `note:${note.id}`,
          icon: 'note',
          section: 'notas',
          label: note.title?.trim() || firstLine(note.content),
          hint: 'nota',
          preview: note.content.slice(0, PREVIEW_CHARS),
        }),
      )
  const taskItems = hidden.task
    ? []
    : rankMatches(
        tasks,
        q,
        (task) => [
          { text: task.title, weight: 120 },
          { text: task.detail ?? '', weight: 60 },
        ],
        (task): CommandSearchContentItem => ({
          kind: 'content',
          id: `task:${task.id}`,
          icon: 'task',
          section: 'tareas',
          label: task.title,
          hint: task.done ? 'tarea hecha' : 'tarea',
          preview: task.detail ?? undefined,
          secondary: task.done
            ? undefined
            : {
                label: 'hecha',
                ariaLabel: `Marcar hecha: ${task.title}`,
                run: () => actions.completeTask(task),
              },
        }),
      )
  const promptItems = hidden.prompt
    ? []
    : rankMatches(
        prompts,
        q,
        (prompt) => [
          { text: prompt.title, weight: 120 },
          { text: prompt.collection ?? '', weight: 70 },
          { text: prompt.content, weight: 50 },
        ],
        (prompt): CommandSearchContentItem => ({
          kind: 'content',
          id: `prompt:${prompt.id}`,
          icon: 'prompt',
          section: 'prompts',
          label: prompt.title,
          hint: prompt.collection ? `prompt · ${prompt.collection}` : 'prompt',
          preview: prompt.content.slice(0, PREVIEW_CHARS),
          secondary: {
            label: 'copiar',
            ariaLabel: `Copiar prompt: ${prompt.title}`,
            run: () => actions.copyPrompt(prompt),
          },
        }),
      )

  return [
    ...noteItems.slice(0, NOTAS_OMNIBOX_GROUP_LIMIT),
    ...taskItems.slice(0, NOTAS_OMNIBOX_GROUP_LIMIT),
    ...promptItems.slice(0, NOTAS_OMNIBOX_GROUP_LIMIT),
  ]
}
