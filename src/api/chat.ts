/**
 * Chat: hilos, mensajes y streaming SSE.
 *
 * `streamChatMessage` parsea el formato SSE de los providers (DeepSeek/OpenAI
 * real, Anthropic/Gemini en chunk único). Eventos: `user`, `chunk`, `done`,
 * `error`. El bloque <<<TRAMA-PROPOSAL ... TRAMA-PROPOSAL>>> ya viene parseado
 * por el servidor; el cliente recibe prose limpio + `proposal`.
 */

import { apiFetch, request } from './request'
import type { ExtractionProposal } from '../types'

export type ChatThread = {
  id: string
  title: string | null
  /** Section that spawned the thread (e.g., 'citas', 'entidades'). null = free chat. */
  context: string | null
  createdAt: string
  updatedAt: string
  messageCount: number
}

export type ChatProposal = {
  entities?: Array<{
    type: string
    name: string
    year?: number
    description?: string
    spotifyUrl?: string
  }>
  relationships?: Array<{
    fromName: string
    toName: string
    type: string
    notes?: string
  }>
  quotes?: Array<{
    entityName: string
    text: string
    source?: string
  }>
  reclassifications?: Array<{
    name: string
    newType: string
    reason?: string
  }>
  /** Inline edits to existing rows. id is the existing row's UUID. */
  edits?: Array<{
    kind: 'entity' | 'quote' | 'relationship'
    id: string
    /** Loose: components introspect what's present. */
    patch: Record<string, unknown>
    reason?: string
    /** For display: name (entity), preview (quote/rel). */
    name?: string
    preview?: string
    entityName?: string
  }>
  /** Soft-delete proposals. UI shows these unchecked by default. */
  deletes?: Array<{
    kind: 'entity' | 'quote' | 'relationship'
    id: string
    preview: string
    reason?: string
  }>
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  proposal: ChatProposal | null
  createdAt: string
  /** Which model produced this assistant message — undefined for user messages. */
  provider?: string
  model?: string
}

export type AskResponse = {
  reply: string
  proposal: ExtractionProposal | null
  provider: string
  model: string
  /** Section thread id — present whenever a view was sent (so future turns can chain). */
  threadId: string | null
}

export const chatApi = {
  async listChatThreads(): Promise<ChatThread[]> {
    return request<ChatThread[]>('/api/chat/threads')
  },
  async createChatThread(
    titleOrOpts?: string | { title?: string; context?: string },
  ): Promise<ChatThread> {
    const body =
      typeof titleOrOpts === 'string' ? { title: titleOrOpts } : (titleOrOpts ?? {})
    return request<ChatThread>('/api/chat/threads', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  async deleteChatThread(id: string): Promise<void> {
    await request<void>(`/api/chat/threads/${id}`, { method: 'DELETE' })
  },
  async listChatMessages(threadId: string): Promise<ChatMessage[]> {
    return request<ChatMessage[]>(`/api/chat/threads/${threadId}/messages`)
  },
  async streamChatMessage(
    threadId: string,
    content: string,
    handlers: {
      onUser?: (msg: ChatMessage) => void
      onChunk?: (text: string) => void
      onDone?: (msg: ChatMessage) => void
      onError?: (message: string) => void
    },
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await apiFetch(`/api/chat/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
      signal,
    })
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '')
      handlers.onError?.(text || `HTTP ${response.status}`)
      return
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sepIdx: number
      while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, sepIdx)
        buffer = buffer.slice(sepIdx + 2)
        let event = 'message'
        const dataLines: string[] = []
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
        }
        if (dataLines.length === 0) continue
        let parsed: unknown
        try {
          parsed = JSON.parse(dataLines.join('\n'))
        } catch {
          continue
        }
        if (event === 'user') handlers.onUser?.(parsed as ChatMessage)
        else if (event === 'chunk') {
          const c = (parsed as { content?: string }).content ?? ''
          if (c) handlers.onChunk?.(c)
        } else if (event === 'done') {
          const msg = (parsed as { assistantMessage?: ChatMessage }).assistantMessage
          if (msg) handlers.onDone?.(msg)
        } else if (event === 'error') {
          handlers.onError?.((parsed as { message?: string }).message ?? 'unknown error')
        }
      }
    }
  },
}
