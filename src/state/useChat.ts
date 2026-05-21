import { useCallback, useRef, useState } from 'react'
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

  // Local placeholder ids so we can find and update the optimistic bubbles.
  const userIdRef = useRef<string | null>(null)
  const assistantIdRef = useRef<string | null>(null)

  const send = useCallback(
    async (content: string) => {
      if (!threadId) throw new Error('No hay hilo activo')
      if (offline) {
        setError('El chat con IA requiere conexión al backend.')
        return
      }
      setPending(true)
      setError(null)

      userIdRef.current = `tmp-u-${Date.now()}`
      assistantIdRef.current = `tmp-a-${Date.now()}`
      const optimisticUser: ChatMessage = {
        id: userIdRef.current,
        role: 'user',
        content,
        proposal: null,
        createdAt: new Date().toISOString(),
      }
      const optimisticAssistant: ChatMessage = {
        id: assistantIdRef.current,
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
              (prev ?? []).map((m) => (m.id === userIdRef.current ? real : m)),
            )
            userIdRef.current = real.id
          },
          onChunk: (text) => {
            queryClient.setQueryData<ChatMessage[]>(messagesKey(threadId), (prev) =>
              (prev ?? []).map((m) =>
                m.id === assistantIdRef.current
                  ? { ...m, content: m.content + text }
                  : m,
              ),
            )
          },
          onDone: (real) => {
            queryClient.setQueryData<ChatMessage[]>(messagesKey(threadId), (prev) =>
              (prev ?? []).map((m) => (m.id === assistantIdRef.current ? real : m)),
            )
            assistantIdRef.current = real.id
            queryClient.invalidateQueries({ queryKey: THREADS_KEY })
          },
          onError: (msg) => {
            setError(msg)
            // Drop the empty assistant bubble so we don't leave a ghost.
            queryClient.setQueryData<ChatMessage[]>(messagesKey(threadId), (prev) =>
              (prev ?? []).filter((m) => m.id !== assistantIdRef.current),
            )
          },
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setPending(false)
      }
    },
    [threadId, offline, queryClient],
  )

  return { send, pending, error }
}
