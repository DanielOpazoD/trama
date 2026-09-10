import { useCallback, useEffect, useMemo } from 'react'
import type { Prompt, Task } from '../../../api'
import type {
  CommandSearchContent,
  CommandSearchContentItem,
} from '../../../hooks/commandSearchModel'
import { normalizeQuery } from '../../../hooks/commandSearchRanking'
import { useSectionPin } from '../../../hooks/useSectionPin'
import {
  useMarkPromptUsed,
  useNotesQuery,
  usePromptsQuery,
  useTasksQuery,
  useToast,
  useUpdateTask,
} from '../../../state'
import { copyText, weekStartLocal } from '../notasUtils'
import { completionPatch } from '../weekModel'
import { buildNotasOmniboxItems, NOTAS_OMNIBOX_MIN_CHARS } from './notasOmniboxModel'

const NO_ITEMS: CommandSearchContentItem[] = []

/**
 * El contenido del mundo Notas en el buscador. Pide las listas solo con texto
 * suficiente y sin PIN que las proteja: una sección protegida no se consulta y,
 * aunque su caché ya esté llena, el modelo no la enseña. Mientras no lleguen las
 * preferencias del servidor, todo cuenta como protegido. `pending` mientras falta
 * alguna lista: un Enter espera a la fila en vez de preguntar.
 */
export function useNotasOmniboxItems({
  open,
  text,
}: {
  open: boolean
  text: string
}): CommandSearchContent {
  const { isContentHidden } = useSectionPin()
  const noteHidden = isContentHidden('notas:notas')
  const taskHidden = isContentHidden('notas:tareas')
  const promptHidden = isContentHidden('notas:prompts')
  const searching = open && normalizeQuery(text).length >= NOTAS_OMNIBOX_MIN_CHARS
  const notesQuery = useNotesQuery({ enabled: searching && !noteHidden })
  const tasksQuery = useTasksQuery({ enabled: searching && !taskHidden })
  const promptsQuery = usePromptsQuery({ enabled: searching && !promptHidden })
  const { mutateAsync: updateTask } = useUpdateTask()
  const { mutate: markPromptUsed } = useMarkPromptUsed()
  const { show: showToast } = useToast()

  // Una lista que no llega no puede leerse como «nada coincide».
  const failed = notesQuery.isError || tasksQuery.isError || promptsQuery.isError
  useEffect(() => {
    if (failed) showToast({ message: 'No se pudo buscar en Notas.', tone: 'error' })
  }, [failed, showToast])

  const completeTask = useCallback(
    (task: Task) => {
      // La regla de Tareas: un pendiente arrastrado queda hecho en la semana donde
      // se resolvió. El aviso llega aunque la paleta ya se haya cerrado.
      void updateTask({
        id: task.id,
        patch: completionPatch(task, weekStartLocal()),
      }).then(
        () => showToast({ message: 'Tarea marcada como hecha.', tone: 'success' }),
        () => showToast({ message: 'No se pudo marcar la tarea.', tone: 'error' }),
      )
    },
    [showToast, updateTask],
  )
  const copyPrompt = useCallback(
    (prompt: Prompt) => {
      // Solo cuenta como usado lo que llegó al portapapeles. El diálogo retirado
      // lo marcaba igual y un fallo de la copia pasaba en silencio.
      void copyText(prompt.content).then(
        () => {
          markPromptUsed(prompt.id)
          showToast({ message: 'Prompt copiado.', tone: 'success' })
        },
        () => showToast({ message: 'No se pudo copiar el prompt.', tone: 'error' }),
      )
    },
    [markPromptUsed, showToast],
  )

  const notes = notesQuery.data
  const tasks = tasksQuery.data
  const prompts = promptsQuery.data
  const items = useMemo(
    () =>
      searching
        ? buildNotasOmniboxItems({
            text,
            notes: notes ?? [],
            tasks: tasks ?? [],
            prompts: prompts ?? [],
            hidden: { note: noteHidden, task: taskHidden, prompt: promptHidden },
            actions: { completeTask, copyPrompt },
          })
        : NO_ITEMS,
    [
      completeTask,
      copyPrompt,
      noteHidden,
      notes,
      promptHidden,
      prompts,
      searching,
      taskHidden,
      tasks,
      text,
    ],
  )
  const pending = notesQuery.isLoading || tasksQuery.isLoading || promptsQuery.isLoading
  return useMemo(() => ({ items, pending }), [items, pending])
}
