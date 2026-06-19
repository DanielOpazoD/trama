import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type NotasAttachmentOwner } from '../api'
import { invalidateAttachmentOwnerSurface } from './cacheInvalidation'
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
      invalidateAttachmentOwnerSurface(qc, attachment.ownerType, attachment.ownerId)
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
      invalidateAttachmentOwnerSurface(qc, ownerType, ownerId)
    },
  })
}
