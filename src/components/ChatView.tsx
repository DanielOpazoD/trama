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
import { ArrowRightIcon } from './Icons'
import { InlineProposal } from './chat/InlineProposal'
import { SkeletonList, ThreadRowSkeleton } from './Skeleton'
import { AISourceTag } from './AISourceTag'

export function ChatView({
  initialThreadId,
  onConsumedInitialThread,
}: {
  /** When set, ChatView opens this thread on mount instead of the most-recent.
      Used for deep-link from AskBar ("ver historial"). */
  initialThreadId?: string | null
  /** Fired the first time initialThreadId is honored, so the parent can
      clear it and the next navigation to /chat behaves normally. */
  onConsumedInitialThread?: () => void
} = {}) {
  const { offline } = useOffline()
  const { data: threads = [], isLoading: threadsLoading } = useChatThreadsQuery()
  const createThread = useCreateChatThread()
  const deleteThread = useDeleteChatThread()

  const [activeId, setActiveId] = useState<string | null>(initialThreadId ?? null)
  // Filter the rail by section. 'all' = no filter. 'free' = threads with
  // context=NULL (the dedicated /chat). Otherwise = a section slug.
  const [contextFilter, setContextFilter] = useState<string>('all')

  // If an initialThreadId arrives after mount (e.g., user clicks "ver
  // historial" while ChatView is already mounted), swap the active thread.
  useEffect(() => {
    if (initialThreadId && initialThreadId !== activeId) {
      setActiveId(initialThreadId)
      onConsumedInitialThread?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialThreadId])

  // Auto-select the most recent thread on first load. Don't override an
  // explicit user selection.
  useEffect(() => {
    if (!activeId && threads.length > 0) {
      setActiveId(threads[0]!.id)
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

  // Build the list of section filters from the threads themselves — chips
  // only show for contexts that actually have a thread, so we don't bloat
  // the rail with empty filters. Entity-focused threads (context starts with
  // "entity:<id>") collapse into a single "entidad" chip so we don't list
  // one chip per entity uuid.
  const availableContexts = Array.from(
    new Set(
      threads
        .map((t) => t.context)
        .filter((c): c is string => !!c)
        // ρ-consistency: el chip del filtro representa la COLECCIÓN
        // (varios hilos sobre entidades) — plural. El chip dentro de
        // cada thread row sigue usando "entidad" singular porque ESE
        // hilo trata de UNA entidad. Pequeña distinción pero ayuda a
        // que el filtro lea uniforme: TODOS · LIBRES · CITAS · ENTIDADES
        // · GRAFO · RELACIONES (todos plural).
        .map((c) => (c.startsWith('entity:') ? 'entidades' : c)),
    ),
  ).sort()

  const visibleThreads = threads.filter((t) => {
    if (contextFilter === 'all') return true
    if (contextFilter === 'free') return t.context === null
    if (contextFilter === 'entidades') return t.context?.startsWith('entity:') ?? false
    return t.context === contextFilter
  })

  return (
    <div className="h-full flex">
      {/* Left rail: thread list */}
      <aside className="w-64 shrink-0 border-r border-ink-100/50 flex flex-col">
        <div className="px-4 py-3 border-b border-ink-100/50 flex items-baseline justify-between">
          <h3 className="text-micro uppercase tracking-eyebrow text-ink-400">conversaciones</h3>
          <button
            onClick={handleNewThread}
            disabled={createThread.isPending}
            className="text-xs text-ink-500 hover:text-ink-700 transition-colors"
            title="Nueva conversación"
          >
            + nueva
          </button>
        </div>
        {availableContexts.length > 0 && (
          // ρ-fix-chat: gap-0.5 + px-1.5/py-0 en cada chip — antes
          // gap-1 + px-2 generaba dos filas en wraps típicos. Ahora
          // entran todos en una sola línea para los 6 valores estándar.
          <div className="px-3 py-2 border-b border-ink-100/40 flex flex-wrap gap-0.5">
            <FilterChip
              label="todos"
              active={contextFilter === 'all'}
              onClick={() => setContextFilter('all')}
            />
            <FilterChip
              label="libres"
              active={contextFilter === 'free'}
              onClick={() => setContextFilter('free')}
            />
            {availableContexts.map((c) => (
              <FilterChip
                key={c}
                label={c}
                active={contextFilter === c}
                onClick={() => setContextFilter(c)}
              />
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {threadsLoading ? (
            <div className="py-2">
              <SkeletonList count={5} Component={ThreadRowSkeleton} />
            </div>
          ) : threads.length === 0 ? (
            <p className="px-4 py-6 text-ink-400 italic text-sm leading-relaxed">
              Aún sin conversaciones. Empieza una arriba o pregunta algo abajo y la
              IA usará tu trama como contexto.
            </p>
          ) : visibleThreads.length === 0 ? (
            <p className="px-4 py-6 text-ink-300 italic text-sm leading-relaxed">
              Sin hilos en esta sección.
            </p>
          ) : (
            <ul>
              {visibleThreads.map((t, idx) => (
                <li
                  key={t.id}
                  className="group relative animate-fade-up"
                  style={{ animationDelay: `${Math.min(idx * 30, 240)}ms` }}
                >
                  <button
                    onClick={() => setActiveId(t.id)}
                    className={
                      t.id === activeId
                        ? 'w-full text-left px-4 py-3 bg-paper-100/70 border-l-2 border-ink-600 transition-colors'
                        : 'w-full text-left px-4 py-3 hover:bg-paper-100/40 border-l-2 border-transparent transition-colors'
                    }
                  >
                    <div className="text-sm text-ink-700 truncate">
                      {t.title ?? defaultTitleFor(t.context)}
                    </div>
                    <div className="text-micro uppercase tracking-eyebrow text-ink-300 mt-0.5 flex items-baseline gap-2">
                      <span>
                        {t.messageCount} {t.messageCount === 1 ? 'mensaje' : 'mensajes'}
                      </span>
                      {t.context && (
                        // ρ-fix-chat: chip de contexto más chico — antes
                        // px-2/py-0.5 + tracking-eyebrow lo convertía en
                        // un bloque grueso que dominaba la fila. Ahora
                        // px-1/py-0 + tracking-wider — sigue legible pero
                        // se siente "marginalia".
                        <span
                          className="px-1 py-0 rounded text-[9px] uppercase tracking-wider font-medium leading-none"
                          style={{
                            backgroundColor: 'var(--accent-primary-soft)',
                            color: 'var(--accent-primary)',
                          }}
                        >
                          {t.context.startsWith('entity:') ? 'entidad' : t.context}
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => handleDeleteThread(t.id)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-ink-300 hover:text-red-700 text-micro uppercase tracking-eyebrow"
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
            {activeThread?.title ?? defaultTitleFor(activeThread?.context)}
          </h2>
          {/* ρ-micro: subtitle por hilo en vez de descripción genérica
              de la app. Antes era la misma frase ("La IA ve toda tu
              trama…") siempre — informativa el primer día, ruido a
              partir del segundo. Ahora dice de dónde nació este hilo
              específico. Si no hay hilo activo, el EmptyChatHint del
              cuerpo explica. */}
          {activeThread && (
            <p className="mt-1.5 text-xs text-ink-400 leading-relaxed">
              {threadSubtitle(activeThread.context)}
            </p>
          )}
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
                // ζ11: indicador "pensando" en lenguaje editorial. En vez
                // del spinner técnico, una elipsis serif que late en
                // sentido literal: cada punto fade-in escalonado. Más en
                // sintonía con el resto de la app que se construye sobre
                // typography más que sobre iconography.
                <li className="text-ink-400 italic text-sm font-serif flex items-baseline gap-1.5">
                  <span>pensando</span>
                  <span aria-hidden className="inline-flex items-baseline gap-[2px]">
                    <span className="dots-dot" style={{ animationDelay: '0ms' }}>·</span>
                    <span className="dots-dot" style={{ animationDelay: '180ms' }}>·</span>
                    <span className="dots-dot" style={{ animationDelay: '360ms' }}>·</span>
                  </span>
                </li>
              )}
              {sendError && (
                <li className="alert-error px-4 py-3 rounded-xl text-sm">
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
            className="flex-1 resize-none bg-paper-100/40 border border-ink-100/60 rounded-xl px-3 py-2 text-sm text-ink-700 placeholder:text-ink-300 focus:outline-none focus:border-ink-200 leading-relaxed transition-colors"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sendPending}
            className="self-end mb-0.5 size-9 rounded-full bg-ink-700 text-paper-50 hover:bg-ink-600 active:scale-90 disabled:bg-ink-100 disabled:text-ink-300 disabled:active:scale-100 transition-all duration-150 ease-out flex items-center justify-center"
            aria-label="Enviar"
            title="Enter para enviar · Shift+Enter para nueva línea"
          >
            <ArrowRightIcon size={14} />
          </button>
        </form>
      </section>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  // ζ9: timestamp humano para marginal. Solo mostramos hora:minuto en
  // bubbles del día corriente; fecha si es de antes. Si no hay
  // createdAt válido, dejamos vacío para no decir "Invalid Date".
  const ts = (() => {
    if (!message.createdAt) return ''
    const d = new Date(message.createdAt)
    if (isNaN(d.getTime())) return ''
    const sameDay = d.toDateString() === new Date().toDateString()
    return sameDay
      ? d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  })()
  return (
    <li className={isUser ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
      <div
        className={
          isUser
            ? // User: sans, ink-on-paper, mantiene voz "cotidiana".
              'self-end max-w-[75%] px-3 py-2 bg-ink-700 text-paper-50 rounded-xl rounded-br-md text-sm leading-relaxed whitespace-pre-wrap'
            : // ζ7+ζ8: Assistant en Spectral serif sobre fondo papel con
              // textura sutil (.bubble-paper en index.css). El cambio de
              // registro tipográfico señala que esto es una "respuesta de
              // catálogo", no un mensaje cotidiano. font-size sube a 15
              // porque Spectral a 14 se ve apretado; a 15 respira.
              'max-w-[80%] px-4 py-3 bubble-paper border border-ink-100/50 text-ink-700 rounded-xl rounded-bl-md font-serif text-[15px] leading-relaxed'
        }
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
        {!isUser && message.proposal && <InlineProposal proposal={message.proposal} />}
      </div>
      {/* ζ9 + κ-info: marginal con timestamp en italic serif (como nota al
          margen de página). En assistant, ya no inlineamos el nombre del
          modelo — esa info vive ahora detrás del icono AISourceTag, que
          al hover muestra provider + modelo + hora completa. La página
          queda más limpia y la metadata sigue accesible a un gesto. */}
      {(ts || (!isUser && message.model)) && (
        <span
          className={`mt-1 inline-flex items-center gap-1.5 text-micro tracking-normal text-ink-300/80 font-serif italic ${
            isUser ? 'self-end mr-1' : 'self-start ml-1'
          }`}
        >
          {ts && <span>{ts}</span>}
          {!isUser && (message.model || message.provider) && (
            <AISourceTag
              provider={message.provider}
              model={message.model}
              at={message.createdAt}
            />
          )}
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

/** Friendly title for a thread that doesn't have one yet — falls back to its
    section context (e.g., "Hilo de Citas") instead of "(sin título)". */
function defaultTitleFor(context: string | null | undefined): string {
  if (!context) return '(sin título)'
  if (context.startsWith('entity:')) return 'Conversación con una entidad'
  const label = context.charAt(0).toUpperCase() + context.slice(1)
  return `Hilo de ${label}`
}

/**
 * ρ-micro: subtitle contextual del hilo activo. Antes el subtitle era
 * la misma descripción de la app en todos los hilos (ruido). Ahora
 * cuenta de DÓNDE nació este hilo en particular — chat libre o
 * iniciado desde una sección concreta.
 */
function threadSubtitle(context: string | null | undefined): string {
  if (!context) {
    return 'Conversación libre — la IA usa toda tu trama como contexto.'
  }
  if (context.startsWith('entity:')) {
    return 'Hilo enfocado en una entidad de tu trama.'
  }
  const label = context.charAt(0).toUpperCase() + context.slice(1)
  return `Iniciado desde ${label}.`
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'px-2 py-0.5 rounded-full text-micro uppercase tracking-eyebrow font-medium transition-colors'
          : 'px-2 py-0.5 rounded-full text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 hover:bg-ink-700/5 transition-colors'
      }
      style={
        active
          ? {
              backgroundColor: 'var(--accent-primary-soft)',
              color: 'var(--accent-primary)',
            }
          : undefined
      }
    >
      {label}
    </button>
  )
}
