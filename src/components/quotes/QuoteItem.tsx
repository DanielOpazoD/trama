import { memo, useState } from 'react'
import { useReflectQuote, useUpdateQuote, useToast } from '../../state'
import type { Entity, Quote } from '../../types'
import { SparkleIcon, ChevronDownIcon } from '../Icons'
import { AISourceTag } from '../AISourceTag'
import { QuoteEditModal } from '../QuoteEditModal'
import { ResonanceDots } from './ResonanceDots'
import { QuoteActionsMenu } from './QuoteActionsMenu'
import { downloadPostal } from '../../lib/postal'

/** Format an ISO date as "20 may 2026" — short, ink-on-paper style. */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d
      .toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
      .replace(/\./g, '')
  } catch {
    return ''
  }
}

function QuoteItemInternal({
  quote,
  entity,
  author,
  isFeature,
  compact = false,
  onSelectEntity,
  onDelete,
}: {
  quote: Quote
  entity: Entity | undefined
  author: Entity | undefined
  isFeature: boolean
  /** Modo compacto (densidad): serif más chico, márgenes y sangrías apretadas. */
  compact?: boolean
  onSelectEntity?: (id: string) => void
  onDelete: () => void
}) {
  const reflect = useReflectQuote()
  const updateQuote = useUpdateQuote()
  const toast = useToast()
  const [draftReflection, setDraftReflection] = useState<{
    text: string
    provider: string
    model: string
  } | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  // δ-citas: la interpretación de la IA arranca colapsada — es material
  // secundario, no debe competir con la cita. Se despliega con la flecha.
  const [reflectionOpen, setReflectionOpen] = useState(false)

  async function handleReflect() {
    try {
      const res = await reflect.mutateAsync(quote.id)
      setDraftReflection({
        text: res.reflection,
        provider: res.provider,
        model: res.model,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al pedir interpretación'
      toast.show({ message: msg, tone: 'error' })
    }
  }

  async function handleSaveReflection() {
    if (!draftReflection) return
    try {
      await updateQuote.mutateAsync({
        id: quote.id,
        patch: {
          aiReflection: draftReflection.text,
          aiReflectionProvider: draftReflection.provider,
          aiReflectionModel: draftReflection.model,
        },
      })
      setDraftReflection(null)
      toast.show({ message: 'Interpretación guardada', tone: 'success' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar'
      toast.show({ message: msg, tone: 'error' })
    }
  }

  async function handlePostal() {
    try {
      await downloadPostal({
        text: quote.text,
        attribution: entity?.name ?? 'Anónimo',
        source: quote.source ?? null,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo generar la postal'
      toast.show({ message: msg, tone: 'error' })
    }
  }

  async function handleTogglePin() {
    try {
      await updateQuote.mutateAsync({ id: quote.id, patch: { pinned: !quote.pinnedAt } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo marcar como favorita'
      toast.show({ message: msg, tone: 'error' })
    }
  }

  return (
    <div className="group">
      {/* ρ-citas: apertura CONSISTENTE — todas las citas como pull-quote con
          guillemets y filete a la izquierda. La destacada (isFeature) sólo
          cambia el tamaño, no el estilo de apertura (antes algunas llevaban
          capital y otras comillas según largo — se veía desprolijo). */}
      <blockquote
        className={`quote-block font-serif italic border-l-2 border-ink-200 pl-4 ${
          compact
            ? 'text-sm leading-snug text-ink-600'
            : `leading-relaxed ${
                isFeature ? 'text-xl text-ink-700' : 'text-base md:text-lg text-ink-600'
              }`
        }`}
      >
        «{quote.text}»
      </blockquote>

      <div
        className={`flex items-center justify-between gap-4 ${
          compact ? 'mt-1.5 pl-4' : 'mt-3 pl-5'
        }`}
      >
        {/* Atribución + fecha */}
        <div className="text-sm min-w-0">
          {author && entity ? (
            <>
              <button
                onClick={() => onSelectEntity?.(author.id)}
                className="text-ink-500 hover:text-ink-700 transition-colors border-b border-transparent hover:border-ink-300"
              >
                — {author.name}
              </button>
              <span className="text-ink-300 mx-1.5">·</span>
              <button
                onClick={() => onSelectEntity?.(entity.id)}
                className="text-ink-400 italic hover:text-ink-700 transition-colors border-b border-transparent hover:border-ink-300"
              >
                {entity.name}
              </button>
            </>
          ) : entity ? (
            <button
              onClick={() => onSelectEntity?.(entity.id)}
              className="text-ink-500 hover:text-ink-700 transition-colors border-b border-transparent hover:border-ink-300"
            >
              — {entity.name}
            </button>
          ) : (
            <span className="text-ink-300">— entidad eliminada</span>
          )}
          {quote.source &&
            quote.source.trim().toLowerCase() !== entity?.name.trim().toLowerCase() && (
              <span className="text-ink-300 ml-2 italic">· {quote.source}</span>
            )}
          {quote.origin.kind === 'ai' && (
            <span
              className="ml-1.5 inline-flex items-center text-[color:var(--accent-primary)]"
              title="propuesta por IA"
            >
              <SparkleIcon size={10} />
            </span>
          )}
          <span
            className="ml-3 text-caption text-ink-300 tabular-nums"
            title={`Añadida el ${new Date(quote.createdAt).toLocaleString('es')}`}
          >
            {formatDate(quote.createdAt)}
          </span>
          {quote.link && (
            <a
              href={quote.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="ml-2 text-caption text-ink-300 hover:text-ink-700 transition-colors border-b border-transparent hover:border-ink-300"
              title={quote.link}
            >
              ↗ enlace
            </a>
          )}
        </div>

        {/* ρ-citas: cluster compacto — resonancia (sin rótulo, aparece al
            hover salvo que ya esté marcada) · favorita · menú "⋯". */}
        <div className="flex items-center gap-1 shrink-0">
          <span
            className={`mr-1 ${
              quote.resonance != null
                ? ''
                : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity'
            }`}
            title="Resonancia: cuánto te toca hoy (1–5)"
          >
            <ResonanceDots
              value={quote.resonance}
              showLabel={false}
              disabled={updateQuote.isPending}
              onChange={async (next) => {
                try {
                  await updateQuote.mutateAsync({
                    id: quote.id,
                    patch: { resonance: next },
                  })
                } catch (err) {
                  toast.show({
                    message:
                      err instanceof Error
                        ? err.message
                        : 'No se pudo guardar la resonancia',
                    tone: 'error',
                  })
                }
              }}
            />
          </span>
          <button
            onClick={handleTogglePin}
            className="p-1.5 rounded transition-colors hover:bg-ink-100 text-ink-300 hover:text-ink-700"
            style={{ color: quote.pinnedAt ? 'var(--accent-gold)' : undefined }}
            aria-label={quote.pinnedAt ? 'Quitar de favoritas' : 'Marcar como favorita'}
            title={quote.pinnedAt ? 'Quitar de favoritas' : 'Marcar como favorita'}
            aria-pressed={!!quote.pinnedAt}
          >
            <span className="text-sm leading-none" aria-hidden>
              {quote.pinnedAt ? '★' : '☆'}
            </span>
          </button>
          <QuoteActionsMenu
            onEdit={() => setEditOpen(true)}
            onPostal={handlePostal}
            onReflect={handleReflect}
            onDelete={onDelete}
            reflectPending={reflect.isPending}
            canReflect={!quote.aiReflection && !draftReflection}
          />
        </div>
      </div>

      <QuoteEditModal quote={quote} open={editOpen} onClose={() => setEditOpen(false)} />

      {quote.userReflection && (
        <div className={compact ? 'mt-2 pl-4' : 'mt-3 pl-5'}>
          <div className="section-eyebrow mb-1">tu reflexión</div>
          <p className="marginalia-script whitespace-pre-wrap">{quote.userReflection}</p>
        </div>
      )}

      {quote.aiReflection && (
        <div className={compact ? 'mt-2 pl-4' : 'mt-3 pl-5'}>
          <div className="flex items-baseline gap-1.5">
            <button
              type="button"
              onClick={() => setReflectionOpen((v) => !v)}
              aria-expanded={reflectionOpen}
              className="flex items-baseline gap-1.5 text-micro uppercase tracking-eyebrow text-[color:var(--accent-primary)] hover:opacity-80 transition-opacity"
            >
              <SparkleIcon size={10} />
              <span>interpretación de la IA</span>
              <ChevronDownIcon
                size={12}
                className={`transition-transform ${reflectionOpen ? '' : '-rotate-90'}`}
              />
            </button>
            <AISourceTag
              provider={quote.aiReflectionProvider}
              model={quote.aiReflectionModel}
              at={quote.aiReflectionAt}
              className="ml-auto"
            />
          </div>
          {reflectionOpen && (
            <p className="mt-1.5 text-ink-500 text-sm leading-relaxed whitespace-pre-wrap animate-fade-up">
              {quote.aiReflection}
            </p>
          )}
        </div>
      )}

      {/* κ6: draft de la lectura IA bajo demanda — el usuario decide si la
          guarda. El trigger ahora vive en el menú "⋯". */}
      {draftReflection && (
        <div
          className={`animate-fade-up ${compact ? 'mt-2 pl-4' : 'mt-3 pl-5'}`}
          aria-live="polite"
        >
          <div className="flex items-baseline gap-1.5 text-micro uppercase tracking-eyebrow text-[color:var(--accent-primary)] mb-1">
            <SparkleIcon size={10} />
            <span>lectura cruzada (borrador)</span>
            <AISourceTag
              provider={draftReflection.provider}
              model={draftReflection.model}
              className="ml-auto"
            />
          </div>
          <p className="text-ink-500 text-sm leading-relaxed whitespace-pre-wrap border-l-2 border-[color:var(--accent-primary-ring)] pl-3">
            {draftReflection.text}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={handleSaveReflection}
              disabled={updateQuote.isPending}
              className="text-micro uppercase tracking-eyebrow text-[color:var(--accent-primary)] hover:text-[color:var(--accent-primary)] transition-colors disabled:opacity-60"
            >
              {updateQuote.isPending ? 'guardando…' : 'guardar'}
            </button>
            <button
              onClick={handleReflect}
              disabled={reflect.isPending}
              className="section-eyebrow hover:text-ink-700 transition-colors disabled:opacity-60"
            >
              {reflect.isPending ? 'releyendo…' : 'otra lectura'}
            </button>
            <button
              onClick={() => setDraftReflection(null)}
              className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-500 transition-colors ml-auto"
            >
              descartar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * N5: memo para que el scroll de QuotesView con 100+ citas no re-renderice
 * cada item al cambiar state global.
 */
export const QuoteItem = memo(QuoteItemInternal, (prev, next) => {
  return (
    prev.quote === next.quote &&
    prev.entity === next.entity &&
    prev.author === next.author &&
    prev.isFeature === next.isFeature &&
    prev.compact === next.compact
  )
})
