import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import type { ChatMessage } from '../api'
import {
  useChatMessagesQuery,
  useChatThreadsQuery,
  useCreateChatThread,
  useDeleteChatThread,
  useOffline,
  useSendChatMessage,
} from '../state'
import { InlineProposal } from './chat/InlineProposal'

export function ChatView() {
  const { offline } = useOffline()
  const { data: threads = [], isLoading: threadsLoading } = useChatThreadsQuery()
  const createThread = useCreateChatThread()
  const deleteThread = useDeleteChatThread()

  const [activeId, setActiveId] = useState<string | null>(null)

  // Auto-select the most recent thread on first load. Don't override an
  // explicit user selection.
  useEffect(() => {
    if (!activeId && threads.length > 0) {
      setActiveId(threads[0].id)
    }
  }, [threads, activeId])

  const { data: messages = [], isLoading: messagesLoading } = useChatMessagesQuery(activeId)
  const { send, pending: sendPending, error: sendError } = useSendChatMessage(activeId)

  const [draft, setDraft] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, sendPending])

  async function handleNewThread() {
    try {
      const t = await createThread.mutateAsync(undefined)
      setActiveId(t.id)
    } catch {
      /* surfaces via createThread.error */
    }
  }

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || sendPending) return

    // If there's no active thread, create one before sending.
    let threadId = activeId
    if (!threadId) {
      try {
        const t = await createThread.mutateAsync(undefined)
        threadId = t.id
        setActiveId(t.id)
      } catch {
        return
      }
    }

    setDraft('')
    await send(text)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }

  async function handleDeleteThread(id: string) {
    if (!confirm('¿Borrar esta conversación? No se puede deshacer.')) return
    try {
      await deleteThread.mutateAsync(id)
      if (activeId === id) setActiveId(null)
    } catch {
      /* surfaces */
    }
  }

  if (offline) {
    return (
      <div className="h-full flex items-center justify-center px-8">
        <p className="text-ink-400 italic max-w-md text-center leading-relaxed">
          El chat con la IA requiere conexión al backend. Estás en modo local —
          conecta a la red y recarga.
        </p>
      </div>
    )
  }

  const activeThread = threads.find((t) => t.id === activeId) ?? null

  return (
    <div className="h-full flex">
      {/* Left rail: thread list */}
      <aside className="w-64 shrink-0 border-r border-ink-100/50 flex flex-col">
        <div className="px-4 py-3 border-b border-ink-100/50 flex items-baseline justify-between">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-ink-400">conversaciones</h3>
          <button
            onClick={handleNewThread}
            disabled={createThread.isPending}
            className="text-xs text-ink-500 hover:text-ink-700 transition-colors"
            title="Nueva conversación"
          >
            + nueva
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threadsLoading ? (
            <p className="px-4 py-6 text-ink-300 italic text-sm">cargando…</p>
          ) : threads.length === 0 ? (
            <p className="px-4 py-6 text-ink-400 italic text-sm leading-relaxed">
              Aún sin conversaciones. Empieza una arriba o pregunta algo abajo y la
              IA usará tu trama como contexto.
            </p>
          ) : (
            <ul>
              {threads.map((t) => (
                <li key={t.id} className="group relative">
                  <button
                    onClick={() => setActiveId(t.id)}
                    className={
                      t.id === activeId
                        ? 'w-full text-left px-4 py-3 bg-paper-100/70 border-l-2 border-ink-600 transition-colors'
                        : 'w-full text-left px-4 py-3 hover:bg-paper-100/40 border-l-2 border-transparent transition-colors'
                    }
                  >
                    <div className="text-sm text-ink-700 truncate">
                      {t.title ?? '(sin título)'}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-ink-300 mt-0.5">
                      {t.messageCount} {t.messageCount === 1 ? 'mensaje' : 'mensajes'}
                    </div>
                  </button>
                  <button
                    onClick={() => handleDeleteThread(t.id)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-ink-300 hover:text-red-700 text-[10px] uppercase tracking-[0.18em]"
                    aria-label="Eliminar conversación"
                  >
                    borrar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Conversation pane */}
      <section className="flex-1 flex flex-col min-w-0">
        <header className="px-6 py-4 border-b border-ink-100/50">
          <h2 className="font-serif text-2xl text-ink-700 leading-none">
            {activeThread?.title ?? 'Chat'}
          </h2>
          <p className="mt-1.5 text-xs text-ink-400 leading-relaxed">
            La IA ve toda tu trama: entidades, relaciones y citas. Pregúntale,
            conversa, y cuando te ofrezca agregar algo, decides.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {!activeId ? (
            <EmptyChatHint />
          ) : messagesLoading ? (
            <p className="text-ink-300 italic">cargando…</p>
          ) : messages.length === 0 ? (
            <EmptyChatHint />
          ) : (
            <ul className="space-y-5 max-w-2xl mx-auto">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {sendPending && messages[messages.length - 1]?.role !== 'assistant' && (
                <li className="text-ink-300 italic text-sm flex items-center gap-2">
                  <span className="size-3 border-2 border-ink-200 border-t-ink-500 rounded-full animate-spin" />
                  pensando…
                </li>
              )}
              {sendError && (
                <li className="px-4 py-3 bg-red-50/80 border border-red-200/60 rounded-xl text-sm text-red-800">
                  {sendError}
                </li>
              )}
              <div ref={messagesEndRef} />
            </ul>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-ink-100/50 px-6 py-4 flex items-end gap-2 max-w-3xl mx-auto w-full"
        >
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="pregúntale a la IA sobre tu trama, sus temas, las personas que la habitan…"
            rows={1}
            disabled={sendPending}
            className="flex-1 resize-none bg-paper-100/40 border border-ink-100/60 rounded-2xl px-3.5 py-2 text-sm text-ink-700 placeholder:text-ink-300 focus:outline-none focus:border-ink-200 leading-relaxed transition-colors"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sendPending}
            className="self-end mb-0.5 size-9 rounded-full bg-ink-700 text-paper-50 hover:bg-ink-600 active:scale-90 disabled:bg-ink-100 disabled:text-ink-300 disabled:active:scale-100 transition-all duration-150 ease-out flex items-center justify-center"
            aria-label="Enviar"
            title="Enter para enviar · Shift+Enter para nueva línea"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      </section>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <li className={isUser ? 'flex justify-end' : 'flex flex-col items-start'}>
      <div
        className={
          isUser
            ? 'self-end max-w-[75%] px-3.5 py-2 bg-ink-700 text-paper-50 rounded-2xl rounded-br-md text-sm leading-relaxed whitespace-pre-wrap'
            : 'max-w-[80%] px-3.5 py-2 bg-paper-100/60 border border-ink-100/50 text-ink-700 rounded-2xl rounded-bl-md text-sm leading-relaxed'
        }
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
        {!isUser && message.proposal && <InlineProposal proposal={message.proposal} />}
      </div>
      {!isUser && message.model && (
        <span
          className="mt-1 ml-1 text-[9px] uppercase tracking-[0.18em] text-ink-300"
          title={message.provider ? `provider: ${message.provider}` : undefined}
        >
          {message.model}
        </span>
      )}
    </li>
  )
}

function EmptyChatHint() {
  return (
    <div className="max-w-md mx-auto text-center px-6 py-12">
      <p className="font-serif text-xl text-ink-500 leading-relaxed">
        Conversa con tu trama.
      </p>
      <p className="mt-3 text-sm text-ink-400 leading-relaxed">
        Pregúntale qué cosas se conectan entre sí, qué autores se parecen, qué
        leer después de un libro que está en la trama, qué clasificación podría
        mejorar. La IA usa todo lo que has guardado como contexto.
      </p>
    </div>
  )
}
