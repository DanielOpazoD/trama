import { useCallback, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ChatMessage, type ChatThread } from '../api'
import { useOffline } from './offline'
import { queryKeys } from './queryClient'

const THREADS_KEY = queryKeys.chatThreads
const messagesKey = queryKeys.chatMessages

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
    mutationFn: (input?: string | { title?: string; context?: string }) =>
      api.createChatThread(input),
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

/**
 * Streaming send.
 *
 * The flow:
 *  1. caller invokes send(content)
 *  2. we append a temporary user bubble + an empty assistant bubble
 *  3. as chunks arrive we mutate the assistant bubble's content in cache
 *  4. on `done` we replace it with the persisted record (real id, proposal)
 *  5. on `error` we set an error string the component can render
 */
export function useSendChatMessage(threadId: string | null) {
  const queryClient = useQueryClient()
  const { offline } = useOffline()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pendingRef = useRef(false)

  const send = useCallback(
    async (content: string) => {
      if (!threadId) throw new Error('No hay hilo activo')
      if (pendingRef.current) {
        setError('Ya hay un mensaje en curso.')
        return
      }
      if (offline) {
        setError('El chat con IA requiere conexión al backend.')
        return
      }
      pendingRef.current = true
      setPending(true)
      setError(null)

      const now = Date.now()
      const optimisticUserId = `tmp-u-${now}`
      const optimisticAssistantId = `tmp-a-${now}`
      const optimisticUser: ChatMessage = {
        id: optimisticUserId,
        role: 'user',
        content,
        proposal: null,
        createdAt: new Date().toISOString(),
      }
      const optimisticAssistant: ChatMessage = {
        id: optimisticAssistantId,
        role: 'assistant',
        content: '',
        proposal: null,
        createdAt: new Date().toISOString(),
      }
      queryClient.setQueryData<ChatMessage[]>(messagesKey(threadId), (prev) => [
        ...(prev ?? []),
        optimisticUser,
        optimisticAssistant,
      ])

      try {
        await api.streamChatMessage(threadId, content, {
          onUser: (real) => {
            // Replace the optimistic user message with the real persisted one.
            queryClient.setQueryData<ChatMessage[]>(messagesKey(threadId), (prev) =>
              (prev ?? []).map((m) => (m.id === optimisticUserId ? real : m)),
            )
          },
          onChunk: (text) => {
            queryClient.setQueryData<ChatMessage[]>(messagesKey(threadId), (prev) =>
              (prev ?? []).map((m) =>
                m.id === optimisticAssistantId ? { ...m, content: m.content + text } : m,
              ),
            )
          },
          onDone: (real) => {
            queryClient.setQueryData<ChatMessage[]>(messagesKey(threadId), (prev) =>
              (prev ?? []).map((m) => (m.id === optimisticAssistantId ? real : m)),
            )
            queryClient.invalidateQueries({ queryKey: THREADS_KEY })
          },
          onError: (msg) => {
            setError(msg)
            // Drop the empty assistant bubble so we don't leave a ghost.
            queryClient.setQueryData<ChatMessage[]>(messagesKey(threadId), (prev) =>
              (prev ?? []).filter((m) => m.id !== optimisticAssistantId),
            )
          },
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        queryClient.setQueryData<ChatMessage[]>(messagesKey(threadId), (prev) =>
          (prev ?? []).filter((m) => m.id !== optimisticAssistantId),
        )
      } finally {
        pendingRef.current = false
        setPending(false)
      }
    },
    [threadId, offline, queryClient],
  )

  return { send, pending, error }
}
