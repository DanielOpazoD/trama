import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type NotasAttachmentOwner } from '../api'
import { queryKeys } from './queryClient'

export function useNotasAttachmentsQuery(input: {
  ownerType: NotasAttachmentOwner
  ownerId: string
  enabled?: boolean
}) {
  return useQuery({
    queryKey: queryKeys.notasAttachments(input.ownerType, input.ownerId),
    queryFn: () =>
      api.notasAttachments.list({
        ownerType: input.ownerType,
        ownerId: input.ownerId,
      }),
    enabled: input.enabled ?? true,
  })
}

export function useUploadNotasAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.notasAttachments.upload,
    onSuccess: (attachment) => {
      qc.invalidateQueries({
        queryKey: queryKeys.notasAttachments(attachment.ownerType, attachment.ownerId),
      })
      // El flag has_photos de la tarea se deriva en el server; refrescamos la
      // lista de tareas para que aparezca/desaparezca su icono distintivo.
      if (attachment.ownerType === 'task') {
        qc.invalidateQueries({ queryKey: queryKeys.tasks })
      }
      // Idem notas: el flag has_images se deriva en el server → refrescar notes.
      if (attachment.ownerType === 'note') {
        qc.invalidateQueries({ queryKey: queryKeys.notes })
      }
    },
  })
}

export function useDeleteNotasAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ownerType,
      ownerId,
    }: {
      id: string
      ownerType: NotasAttachmentOwner
      ownerId: string
    }) => api.notasAttachments.remove(id).then(() => ({ ownerType, ownerId })),
    onSuccess: ({ ownerType, ownerId }) => {
      qc.invalidateQueries({
        queryKey: queryKeys.notasAttachments(ownerType, ownerId),
      })
      if (ownerType === 'task') {
        qc.invalidateQueries({ queryKey: queryKeys.tasks })
      }
      if (ownerType === 'note') {
        qc.invalidateQueries({ queryKey: queryKeys.notes })
      }
    },
  })
}
