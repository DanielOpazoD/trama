import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ChatMessage, type ChatThread } from '../api'
import { useOffline } from './offline'

const THREADS_KEY = ['chat', 'threads'] as const
const messagesKey = (threadId: string) => ['chat', 'messages', threadId] as const

export function useChatThreadsQuery() {
  const { offline } = useOffline()
  return useQuery({
    queryKey: THREADS_KEY,
    queryFn: () => api.listChatThreads(),
    enabled: !offline,
  })
}

export function useCreateChatThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (title?: string) => api.createChatThread(title),
    onSuccess: (thread) => {
      queryClient.setQueryData<ChatThread[]>(THREADS_KEY, (prev) => [
        thread,
        ...(prev ?? []),
      ])
    },
  })
}

export function useDeleteChatThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.deleteChatThread(id)
      return id
    },
    onSuccess: (id) => {
      queryClient.setQueryData<ChatThread[]>(THREADS_KEY, (prev) =>
        (prev ?? []).filter((t) => t.id !== id),
      )
      queryClient.removeQueries({ queryKey: messagesKey(id) })
    },
  })
}

export function useChatMessagesQuery(threadId: string | null) {
  return useQuery({
    queryKey: threadId ? messagesKey(threadId) : ['chat', 'messages', '__none__'],
    queryFn: () => (threadId ? api.listChatMessages(threadId) : Promise.resolve([])),
    enabled: !!threadId,
  })
}

export function useSendChatMessage(threadId: string | null) {
  const queryClient = useQueryClient()
  const { offline } = useOffline()
  return useMutation({
    mutationFn: async (content: string) => {
      if (!threadId) throw new Error('No hay hilo activo')
      if (offline) throw new Error('El chat con IA requiere conexión al backend.')
      return api.sendChatMessage(threadId, content)
    },
    onSuccess: (res) => {
      if (!threadId) return
      queryClient.setQueryData<ChatMessage[]>(messagesKey(threadId), (prev) => {
        const next = [...(prev ?? []), res.userMessage]
        if (res.assistantMessage) next.push(res.assistantMessage)
        return next
      })
      // Bump thread to the top of the sidebar list.
      queryClient.setQueryData<ChatThread[]>(THREADS_KEY, (prev) => {
        const list = prev ?? []
        const idx = list.findIndex((t) => t.id === threadId)
        if (idx === -1) return list
        const bumped = {
          ...list[idx],
          updatedAt: new Date().toISOString(),
          messageCount:
            list[idx].messageCount + 1 + (res.assistantMessage ? 1 : 0),
        }
        return [bumped, ...list.filter((t) => t.id !== threadId)]
      })
      // Title may have been auto-generated server-side; refresh the thread list.
      queryClient.invalidateQueries({ queryKey: THREADS_KEY })
    },
  })
}
