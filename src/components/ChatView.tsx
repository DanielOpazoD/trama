import {
  Fragment,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  useChatMessagesQuery,
  useChatThreadsQuery,
  useCreateChatThread,
  useDeleteChatThread,
  useOffline,
  useSendChatMessage,
} from '../state'
import { ArrowRightIcon } from './Icons'
import { SkeletonList, ThreadRowSkeleton } from './Skeleton'
import { LoadingHint } from './LoadingHint'
import { MessageBubble } from './chat/MessageBubble'
import { EmptyChatHint } from './chat/EmptyChatHint'
import { FilterChip } from './chat/FilterChip'
import { AIThinkingLabel } from './AIThinkingLabel'
import { defaultTitleFor, threadSubtitle } from './chat/threadLabels'
import { sessionBreakLabel } from './chat/sessionBreaks'

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
  }, [initialThreadId, activeId, onConsumedInitialThread])

  // Auto-select the most recent thread on first load. Don't override an
  // explicit user selection.
  useEffect(() => {
    if (!activeId && threads.length > 0) {
      setActiveId(threads[0]!.id)
    }
  }, [threads, activeId])

  const { data: messages = [], isLoading: messagesLoading } =
    useChatMessagesQuery(activeId)
  // S2: useDeferredValue marca el render de la lista como low-priority.
  // Durante streaming, cada chunk dispara una actualización del cache
  // de TanStack Query → re-render de toda la lista. Sin deferred, ese
  // trabajo bloquea el input mientras el user tipea (laggy textarea).
  // Con deferred, React puede pausar el re-render de la lista si hay
  // un keystroke pendiente, manteniendo el input snappy.
  const deferredMessages = useDeferredValue(messages)
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
          El chat con la IA requiere conexión al backend. Estás en modo local — conecta a
          la red y recarga.
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
          <h3 className="section-eyebrow">conversaciones</h3>
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
              Aún sin conversaciones. Empieza una arriba o pregunta algo abajo y la IA
              usará tu trama como contexto.
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
                          className="px-1 py-0 rounded text-micro uppercase tracking-wider font-medium leading-none"
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
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-ink-300 hover:text-[color:var(--accent-clay)] text-micro uppercase tracking-eyebrow"
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
            <LoadingHint text="cargando" />
          ) : deferredMessages.length === 0 ? (
            <EmptyChatHint />
          ) : (
            <ul className="space-y-5 max-w-2xl mx-auto">
              {deferredMessages.map((m, i) => {
                // Separador de sesión: el hilo retomado otro día se marca
                // como capítulo, no como continuación silenciosa.
                const breakLabel = sessionBreakLabel(
                  deferredMessages[i - 1]?.createdAt,
                  m.createdAt,
                )
                return (
                  <Fragment key={m.id}>
                    {breakLabel && (
                      <li className="flex items-center gap-3 py-1" role="separator">
                        <span aria-hidden className="flex-1 h-px bg-ink-100/70" />
                        <span className="font-serif text-micro uppercase tracking-eyebrow text-ink-300">
                          · {breakLabel} ·
                        </span>
                        <span aria-hidden className="flex-1 h-px bg-ink-100/70" />
                      </li>
                    )}
                    <MessageBubble message={m} threadTitle={activeThread?.title} />
                  </Fragment>
                )
              })}
              {sendPending &&
                deferredMessages[deferredMessages.length - 1]?.role !== 'assistant' && (
                  <li
                    className="text-ink-400 italic text-sm font-serif flex items-center gap-1.5"
                    role="status"
                    aria-live="polite"
                  >
                    <AIThinkingLabel />
                  </li>
                )}
              {sendError && (
                <li className="alert-error px-4 py-3 rounded-xl text-sm">{sendError}</li>
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
            className="flex-1 resize-none bg-paper-100/40 border border-ink-100/60 rounded-xl px-3 py-2 text-sm text-ink-700 placeholder:text-ink-300 focus:border-ink-200 leading-relaxed transition-colors"
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
