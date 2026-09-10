import { useCallback, useMemo } from 'react'
import type { Prompt, Task } from '../../../api'
import type { CommandSearchContentItem } from '../../../hooks/commandSearchModel'
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
import { copyText } from '../notasUtils'
import { buildNotasOmniboxItems, NOTAS_OMNIBOX_MIN_CHARS } from './notasOmniboxModel'

const NO_ITEMS: CommandSearchContentItem[] = []

/**
 * El contenido del mundo Notas en el buscador. Pide las listas solo con texto
 * suficiente y sin PIN que las proteja: una sección protegida no se consulta y,
 * aunque su caché ya esté llena, el modelo no la enseña. Mientras no lleguen las
 * preferencias del servidor, todo cuenta como protegido.
 */
export function useNotasOmniboxItems({
  open,
  text,
}: {
  open: boolean
  text: string
}): CommandSearchContentItem[] {
  const { isContentHidden } = useSectionPin()
  const noteHidden = isContentHidden('notas:notas')
  const taskHidden = isContentHidden('notas:tareas')
  const promptHidden = isContentHidden('notas:prompts')
  const searching = open && normalizeQuery(text).length >= NOTAS_OMNIBOX_MIN_CHARS
  const { data: notes } = useNotesQuery({ enabled: searching && !noteHidden })
  const { data: tasks } = useTasksQuery({ enabled: searching && !taskHidden })
  const { data: prompts } = usePromptsQuery({ enabled: searching && !promptHidden })
  const { mutate: updateTask } = useUpdateTask()
  const { mutate: markPromptUsed } = useMarkPromptUsed()
  const toast = useToast()

  const completeTask = useCallback(
    (task: Task) => updateTask({ id: task.id, patch: { done: true } }),
    [updateTask],
  )
  const copyPrompt = useCallback(
    (prompt: Prompt) => {
      // Solo cuenta como usado lo que llegó al portapapeles. El diálogo retirado
      // lo marcaba igual y un fallo de la copia pasaba en silencio.
      void copyText(prompt.content).then(
        () => {
          markPromptUsed(prompt.id)
          toast.show({ message: 'Prompt copiado.', tone: 'success' })
        },
        () => toast.show({ message: 'No se pudo copiar el prompt.', tone: 'error' }),
      )
    },
    [markPromptUsed, toast],
  )

  return useMemo(
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
}
