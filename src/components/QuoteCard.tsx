import { useState } from 'react'
import {
  useDeleteQuote,
  useEntitiesQuery,
  useReflectQuote,
  useUpdateQuote,
} from '../state'
import type { Quote } from '../types'
import { PencilIcon, SparkleIcon, TrashIcon } from './Icons'
import { QuoteEditMode } from './quotes/QuoteEditMode'

/**
 * One quote, expanded.
 *
 * Shows the literal text, the source/context (if any), the user's own
 * reflection (if any), and the AI reflection (if generated and saved).
 *
 * Affordances:
 *   - "tu reflexión" → toggle to add/edit a user_reflection
 *   - "pedir interpretación" → calls /api/quotes/:id/reflect, shows the
 *     result inline with [guardar / descartar] buttons. Only persists if the
 *     user confirms (same AI-scribe-human-curates contract).
 *   - "eliminar" → soft-delete the quote.
 *
 * Linked quotes are rendered as small chips at the bottom — clicking one
 * fires onSelectLinked(id) so the parent can scroll/highlight.
 */
export function QuoteCard({
  quote,
  linkedQuotes,
  onSelectEntity,
  onSelectLinked,
}: {
  quote: Quote
  linkedQuotes?: Quote[]
  onSelectEntity?: (id: string) => void
  onSelectLinked?: (quoteId: string) => void
}) {
  const updateQuote = useUpdateQuote()
  const reflectQuote = useReflectQuote()
  const deleteQuote = useDeleteQuote()
  const { data: entities = [] } = useEntitiesQuery()

  const [editingUserRefl, setEditingUserRefl] = useState(false)
  const [userReflDraft, setUserReflDraft] = useState(quote.userReflection ?? '')

  // Full edit mode — text + source + context + which entity it belongs to.
  // El UI vive en `quotes/QuoteEditMode.tsx`; acá sólo el toggle + el
  // handler de save que hace patch sólo de los campos cambiados.
  const [editingFull, setEditingFull] = useState(false)

  function startFullEdit() {
    setEditingFull(true)
  }

  async function handleSaveFullEdit(patch: {
    text: string
    source: string | null
    context: string | null
    entityId?: string
  }) {
    try {
      await updateQuote.mutateAsync({ id: quote.id, patch })
      setEditingFull(false)
    } catch {
      /* surfaces */
    }
  }

  // Pending AI reflection — generated but not yet saved.
  const [pendingAi, setPendingAi] = useState<{
    text: string
    provider: string
    model: string
  } | null>(null)
  const [reflectError, setReflectError] = useState<string | null>(null)

  async function handleSaveUserReflection() {
    const next = userReflDraft.trim() || null
    if ((quote.userReflection ?? null) === next) {
      setEditingUserRefl(false)
      return
    }
    try {
      await updateQuote.mutateAsync({ id: quote.id, patch: { userReflection: next } })
      setEditingUserRefl(false)
    } catch {
      // surfaces via updateQuote.error
    }
  }

  async function handleAskReflection() {
    setReflectError(null)
    setPendingAi(null)
    try {
      const res = await reflectQuote.mutateAsync(quote.id)
      setPendingAi({ text: res.reflection, provider: res.provider, model: res.model })
    } catch (err) {
      setReflectError(
        err instanceof Error ? err.message : 'Error pidiendo interpretación',
      )
    }
  }

  async function handleAcceptAi() {
    if (!pendingAi) return
    try {
      await updateQuote.mutateAsync({
        id: quote.id,
        patch: {
          aiReflection: pendingAi.text,
          aiReflectionProvider: pendingAi.provider,
          aiReflectionModel: pendingAi.model,
        },
      })
      setPendingAi(null)
    } catch {
      /* surfaces */
    }
  }

  async function handleDiscardAiSaved() {
    try {
      await updateQuote.mutateAsync({
        id: quote.id,
        patch: {
          aiReflection: null,
          aiReflectionProvider: null,
          aiReflectionModel: null,
        },
      })
    } catch {
      /* surfaces */
    }
  }

  if (editingFull) {
    return (
      <QuoteEditMode
        quote={quote}
        entities={entities}
        pending={updateQuote.isPending}
        onCancel={() => setEditingFull(false)}
        onSave={handleSaveFullEdit}
      />
    )
  }

  return (
    <li className="group border-l-2 border-ink-200/70 pl-3">
      {/* Doble-click sobre la cita entra a edit full directo —
          patrón estándar Linear/Notion. */}
      <blockquote
        onDoubleClick={startFullEdit}
        className="font-serif text-ink-600 italic leading-relaxed text-sm cursor-text select-text"
        title="Doble click para editar"
      >
        «{quote.text}»
      </blockquote>

      <div className="mt-1 flex items-baseline gap-3 text-xs">
        {quote.source && <span className="text-ink-400">{quote.source}</span>}
        {quote.origin.kind === 'ai' && (
          <span
            className="inline-flex items-center"
            style={{ color: 'var(--accent-primary)' }}
            title="propuesta por IA"
          >
            <SparkleIcon size={10} />
          </span>
        )}
        <span
          className="text-ink-300 tabular-nums"
          title={`Añadida el ${new Date(quote.createdAt).toLocaleString('es')}`}
        >
          {new Date(quote.createdAt).toLocaleDateString('es', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
        <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={startFullEdit}
            aria-label="Editar cita"
            title="Editar"
            className="p-1 rounded text-ink-300 hover:text-ink-700 transition-colors"
          >
            <PencilIcon size={13} />
          </button>
          <button
            onClick={() => deleteQuote.mutate(quote.id)}
            aria-label="Eliminar cita"
            title="Eliminar"
            className="p-1 rounded text-ink-300 hover:text-red-700 transition-colors"
          >
            <TrashIcon size={13} />
          </button>
        </span>
      </div>

      {quote.context && (
        <p className="mt-1 text-ink-400 text-xs leading-relaxed">{quote.context}</p>
      )}

      {/* User reflection */}
      <div className="mt-3">
        {editingUserRefl ? (
          <div className="space-y-2">
            <textarea
              value={userReflDraft}
              onChange={(e) => setUserReflDraft(e.target.value)}
              placeholder="tu reflexión sobre esta cita…"
              rows={3}
              className="input-paper w-full resize-none text-sm"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setEditingUserRefl(false)
                  setUserReflDraft(quote.userReflection ?? '')
                }}
                className="btn-ghost text-xs"
              >
                cancelar
              </button>
              <button
                onClick={handleSaveUserReflection}
                disabled={updateQuote.isPending}
                className="btn-accent text-xs"
              >
                {updateQuote.isPending ? 'guardando…' : 'guardar reflexión'}
              </button>
            </div>
          </div>
        ) : quote.userReflection ? (
          <div className="group/refl">
            <div className="flex items-baseline gap-2">
              <span className="section-eyebrow">tu reflexión</span>
              <button
                onClick={() => setEditingUserRefl(true)}
                aria-label="Editar reflexión"
                title="Editar"
                className="opacity-0 group-hover/refl:opacity-100 transition-opacity inline-flex text-ink-300 hover:text-ink-700"
              >
                <PencilIcon size={12} />
              </button>
            </div>
            {/* μ1: marginalia manuscrita — la reflexión propia se lee
                como anotación tuya, no como prosa del catálogo. */}
            <p className="marginalia-script mt-0.5 whitespace-pre-wrap">
              {quote.userReflection}
            </p>
          </div>
        ) : (
          <button
            onClick={() => setEditingUserRefl(true)}
            className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
          >
            + añadir tu reflexión
          </button>
        )}
      </div>

      {/* AI reflection — saved */}
      {quote.aiReflection && !pendingAi && (
        <div className="mt-3 group/airefl">
          <div className="flex items-baseline gap-2">
            <span style={{ color: 'var(--accent-primary)' }} className="inline-flex">
              <SparkleIcon size={10} />
            </span>
            <span
              className="text-micro uppercase tracking-eyebrow"
              style={{ color: 'var(--accent-primary)' }}
            >
              interpretación de la IA
            </span>
            {quote.aiReflectionAt && (
              <span className="text-micro text-ink-300 tabular-nums">
                {new Date(quote.aiReflectionAt).toLocaleDateString('es', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            )}
            <button
              onClick={handleDiscardAiSaved}
              aria-label="Eliminar interpretación"
              title="Eliminar esta interpretación"
              className="opacity-0 group-hover/airefl:opacity-100 transition-opacity inline-flex text-ink-300 hover:text-red-700"
            >
              <TrashIcon size={12} />
            </button>
          </div>
          <p className="text-ink-500 text-sm leading-relaxed mt-0.5 whitespace-pre-wrap">
            {quote.aiReflection}
          </p>
        </div>
      )}

      {/* AI reflection — pending review */}
      {pendingAi && (
        <div className="mt-3 ai-panel p-3">
          <div className="flex items-baseline gap-2 mb-1">
            <span style={{ color: 'var(--accent-primary)' }} className="inline-flex">
              <SparkleIcon size={10} />
            </span>
            <span
              className="text-micro uppercase tracking-eyebrow"
              style={{ color: 'var(--accent-primary)' }}
            >
              propuesta de la IA
            </span>
          </div>
          <p className="text-ink-600 text-sm leading-relaxed whitespace-pre-wrap">
            {pendingAi.text}
          </p>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button onClick={() => setPendingAi(null)} className="btn-ghost text-xs">
              descartar
            </button>
            <button
              onClick={handleAcceptAi}
              disabled={updateQuote.isPending}
              className="btn-accent text-xs"
            >
              {updateQuote.isPending ? 'guardando…' : 'guardar'}
            </button>
          </div>
        </div>
      )}

      {/* No AI reflection yet — a discrete icon button (with tooltip) sits in
          the meta row below the quote, alongside Spotify / source. Keeps the
          card visually quiet until the user actually wants AI help. */}
      {!quote.aiReflection && !pendingAi && (
        <div className="mt-2">
          <button
            onClick={handleAskReflection}
            disabled={reflectQuote.isPending}
            aria-label="Pedir interpretación a la IA"
            title="Pedir interpretación a la IA"
            className="inline-flex items-center justify-center size-7 rounded-full transition-colors hover:bg-[color:var(--accent-primary-soft)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ color: 'var(--accent-primary)' }}
          >
            {reflectQuote.isPending ? (
              <span
                className="size-3 border-2 rounded-full animate-spin"
                style={{
                  borderColor: 'var(--accent-primary-ring)',
                  borderTopColor: 'var(--accent-primary)',
                }}
              />
            ) : (
              <SparkleIcon size={14} />
            )}
          </button>
          {reflectError && <p className="mt-1 text-xs text-red-700">{reflectError}</p>}
        </div>
      )}

      {/* Linked quotes — chips */}
      {linkedQuotes && linkedQuotes.length > 0 && (
        <div className="mt-3">
          <span className="text-micro uppercase tracking-eyebrow text-ink-300">
            citas vinculadas
          </span>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {linkedQuotes.map((q) => (
              <li key={q.id}>
                <button
                  onClick={() => onSelectLinked?.(q.id)}
                  className="text-caption px-2 py-0.5 rounded-full bg-paper-100 border border-ink-100/60 text-ink-500 hover:text-ink-700 hover:border-ink-200 transition-colors"
                  title={q.text}
                >
                  «{truncate(q.text, 40)}»
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onSelectEntity && <span className="sr-only" data-entity-link={quote.entityId} />}
    </li>
  )
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}
