import { useState } from 'react'
import {
  useDeleteQuote,
  useEntitiesQuery,
  useReflectQuote,
  useUpdateQuote,
} from '../state'
import type { Quote } from '../types'
import { SparkleIcon, TrashIcon } from './Icons'
import { OverflowMenu, OverflowMenuItem } from './OverflowMenu'
import { QuoteEditMode } from './quotes/QuoteEditMode'

/**
 * Una cita, expandida — versión del panel de entidad.
 *
 * Muestra el texto, la fuente, la reflexión del usuario (si la hay) y la
 * interpretación de la IA (si está guardada). TODAS las acciones (editar,
 * reflexión, pedir/quitar interpretación, eliminar) viven en un solo menú ⋯
 * para mantener la tarjeta limpia y minimalista.
 */
export function QuoteCard({
  quote,
  linkedQuotes,
  onSelectLinked,
}: {
  quote: Quote
  linkedQuotes?: Quote[]
  onSelectLinked?: (quoteId: string) => void
}) {
  const updateQuote = useUpdateQuote()
  const reflectQuote = useReflectQuote()
  const deleteQuote = useDeleteQuote()
  const { data: entities = [] } = useEntitiesQuery()

  const [editingUserRefl, setEditingUserRefl] = useState(false)
  const [userReflDraft, setUserReflDraft] = useState(quote.userReflection ?? '')
  const [editingFull, setEditingFull] = useState(false)

  function startFullEdit() {
    setEditingFull(true)
  }

  async function handleSaveFullEdit(patch: {
    text: string
    source: string | null
    entityId?: string
  }) {
    try {
      await updateQuote.mutateAsync({ id: quote.id, patch })
      setEditingFull(false)
    } catch {
      /* surfaces */
    }
  }

  // Reflexión IA generada pero aún sin guardar.
  const [pendingAi, setPendingAi] = useState<{
    text: string
    provider: string
    model: string
  } | null>(null)
  const [reflectError, setReflectError] = useState<string | null>(null)

  function startReflection() {
    setUserReflDraft(quote.userReflection ?? '')
    setEditingUserRefl(true)
  }

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
      /* surfaces via updateQuote.error */
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
      <blockquote
        onDoubleClick={startFullEdit}
        className="font-serif text-ink-600 italic leading-relaxed text-sm cursor-text select-text"
        title="Doble click para editar"
      >
        «{quote.text}»
      </blockquote>

      <div className="mt-1 flex items-center gap-3 text-xs">
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
        <span className="ml-auto">
          <OverflowMenu width="w-52">
            {(close) => (
              <>
                <OverflowMenuItem
                  onClick={() => {
                    close()
                    startFullEdit()
                  }}
                >
                  Editar
                </OverflowMenuItem>
                <OverflowMenuItem
                  onClick={() => {
                    close()
                    startReflection()
                  }}
                >
                  {quote.userReflection ? 'Editar tu reflexión' : 'Añadir tu reflexión'}
                </OverflowMenuItem>
                {!quote.aiReflection ? (
                  <OverflowMenuItem
                    disabled={reflectQuote.isPending}
                    onClick={() => {
                      close()
                      handleAskReflection()
                    }}
                  >
                    <SparkleIcon size={12} />
                    {reflectQuote.isPending
                      ? 'Pidiendo…'
                      : 'Pedir interpretación a la IA'}
                  </OverflowMenuItem>
                ) : (
                  <OverflowMenuItem
                    onClick={() => {
                      close()
                      handleDiscardAiSaved()
                    }}
                  >
                    <SparkleIcon size={12} />
                    Quitar interpretación
                  </OverflowMenuItem>
                )}
                <div className="h-px bg-ink-100 my-1" />
                <OverflowMenuItem
                  danger
                  onClick={() => {
                    close()
                    deleteQuote.mutate(quote.id)
                  }}
                >
                  <TrashIcon size={12} />
                  Eliminar
                </OverflowMenuItem>
              </>
            )}
          </OverflowMenu>
        </span>
      </div>

      {/* Reflexión del usuario — edición inline (disparada desde el menú). */}
      {editingUserRefl ? (
        <div className="mt-3 space-y-2">
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
      ) : (
        quote.userReflection && (
          <div className="mt-3">
            <span className="section-eyebrow">tu reflexión</span>
            {/* μ1: marginalia manuscrita — se lee como anotación tuya. */}
            <p className="marginalia-script mt-0.5 whitespace-pre-wrap">
              {quote.userReflection}
            </p>
          </div>
        )
      )}

      {/* Interpretación IA guardada (solo lectura; se quita desde el menú). */}
      {quote.aiReflection && !pendingAi && (
        <div className="mt-3">
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
          </div>
          <p className="text-ink-500 text-sm leading-relaxed mt-0.5 whitespace-pre-wrap">
            {quote.aiReflection}
          </p>
        </div>
      )}

      {/* Interpretación IA recién pedida — pendiente de revisar. */}
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

      {reflectError && <p className="mt-1 text-xs text-red-700">{reflectError}</p>}

      {/* Citas vinculadas — chips */}
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
    </li>
  )
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}
