import {
  useDeleteNote,
  useDeleteRecorte,
  usePromoteNote,
  useToast,
  useUpdateNote,
  useUpdateRecorte,
} from '../../state'
import type { Note } from '../../api'

type NotePatch = Parameters<ReturnType<typeof useUpdateNote>['mutate']>[0]['patch']

/**
 * Las acciones por ítem del feed de Notas: fijar, editar, borrar y promover
 * notas; archivar, restaurar y borrar recortes. Viven aquí y no en
 * `NotasFeedView` para que la vista orqueste (filtros, feed, virtualización)
 * sin cargar con cinco mutaciones y sus avisos.
 */
export function useNotasFeedItemActions() {
  const toast = useToast()
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()
  const promoteNote = usePromoteNote()
  const updateRecorte = useUpdateRecorte()
  const deleteRecorte = useDeleteRecorte()

  return {
    noteBusy: updateNote.isPending || deleteNote.isPending,
    promotingNoteId: promoteNote.isPending
      ? (promoteNote.variables as string | undefined)
      : undefined,
    toggleNotePin: (note: Note) =>
      updateNote.mutate({ id: note.id, patch: { pinned: !note.pinned } }),
    editNote: (id: string, patch: NotePatch) => updateNote.mutate({ id, patch }),
    deleteNote: (id: string) => deleteNote.mutate(id),
    promoteNote: (id: string) =>
      promoteNote.mutate(id, {
        onSuccess: () =>
          toast.show({ message: 'Nota promovida a Momento.', tone: 'success' }),
        onError: (e) =>
          toast.show({
            message: e instanceof Error ? e.message : 'No se pudo promover',
            tone: 'error',
          }),
      }),
    archiveRecorte: (id: string) =>
      updateRecorte.mutate({ id, patch: { status: 'archived' } }),
    restoreRecorte: (id: string) =>
      updateRecorte.mutate({ id, patch: { status: 'pending' } }),
    deleteRecorte: (id: string) => deleteRecorte.mutate(id),
  }
}
