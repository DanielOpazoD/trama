import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatApi, type ChatMessage } from './chat'

const userMessage: ChatMessage = {
  id: 'msg-user',
  role: 'user',
  content: 'hola',
  proposal: null,
  createdAt: '2026-05-31T00:00:00.000Z',
}

const assistantMessage: ChatMessage = {
  id: 'msg-assistant',
  role: 'assistant',
  content: 'respuesta completa',
  proposal: null,
  createdAt: '2026-05-31T00:00:01.000Z',
  provider: 'openai',
  model: 'gpt-test',
}

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    { status: 200 },
  )
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

describe('chatApi.streamChatMessage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('parsea eventos SSE de usuario, chunks, done y error aunque lleguen fragmentados', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      streamResponse([
        sse('user', userMessage).slice(0, 24),
        sse('user', userMessage).slice(24) + sse('chunk', { content: 'res' }),
        sse('chunk', { content: 'puesta' }) + 'event: chunk\ndata: {bad-json}\n\n',
        sse('error', { message: 'warning parcial' }) + sse('done', { assistantMessage }),
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const events: string[] = []
    await chatApi.streamChatMessage('thread-1', 'hola', {
      onUser: (msg) => events.push(`user:${msg.id}`),
      onChunk: (text) => events.push(`chunk:${text}`),
      onDone: (msg) => events.push(`done:${msg.id}:${msg.model}`),
      onError: (message) => events.push(`error:${message}`),
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/threads/thread-1/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: 'hola' }),
      }),
    )
    expect(events).toEqual([
      'user:msg-user',
      'chunk:res',
      'chunk:puesta',
      'error:warning parcial',
      'done:msg-assistant:gpt-test',
    ])
  })

  it('reporta el texto del response cuando el POST de streaming falla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => new Response('rate limited', { status: 429 })),
    )

    const errors: string[] = []
    await chatApi.streamChatMessage('thread-1', 'hola', {
      onError: (message) => errors.push(message),
    })

    expect(errors).toEqual(['rate limited'])
  })

  it('reporta message canónico cuando el POST de streaming devuelve ApiErrors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        Response.json(
          {
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Sesión requerida',
              requestId: 'rid-chat-stream',
            },
          },
          { status: 401 },
        ),
      ),
    )

    const errors: string[] = []
    await chatApi.streamChatMessage('thread-1', 'hola', {
      onError: (message) => errors.push(message),
    })

    expect(errors).toEqual(['Sesión requerida'])
  })

  it('pasa AbortSignal hasta el transporte raw del streaming', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn<typeof fetch>(async () => streamResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await chatApi.streamChatMessage('thread-1', 'hola', {}, controller.signal)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/threads/thread-1/messages',
      expect.objectContaining({ signal: controller.signal }),
    )
  })
})
