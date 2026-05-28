import { memo, useState } from 'react'
import { useReflectQuote, useUpdateQuote, useToast } from '../../state'
import type { Entity, Quote } from '../../types'
import { SparkleIcon, TrashIcon } from '../Icons'
import { AISourceTag } from '../AISourceTag'
import { QuoteEditModal } from '../QuoteEditModal'

/** Format an ISO date as "20 may 2026" — short, ink-on-paper style. */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d
      .toLocaleDateString('es', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
      .replace(/\./g, '')
  } catch {
    return ''
  }
}

/** Drop-cap on the first letter of a quote — adds editorial weight without
    blowing up the layout. Size aligned with the body type below. */
function withDropCap(text: string) {
  if (!text) return null
  const first = text[0]
  const rest = text.slice(1)
  return (
    <>
      <span className="float-left mr-1.5 mt-1 text-4xl leading-[0.85] font-serif text-ink-700 select-none">
        {first}
      </span>
      {rest}
    </>
  )
}

function QuoteItemInternal({
  quote,
  entity,
  author,
  isFeature,
  onSelectEntity,
  onDelete,
}: {
  quote: Quote
  entity: Entity | undefined
  author: Entity | undefined
  isFeature: boolean
  onSelectEntity?: (id: string) => void
  onDelete: () => void
}) {
  // κ6: estado local para la reflexión IA pendiente. Una vez generada,
  // mostramos un preview con guardar/descartar; al guardar se persiste
  // vía updateQuote y este estado se limpia (porque quote.aiReflection
  // pasa a tener valor y la rama de render cambia).
  const reflect = useReflectQuote()
  const updateQuote = useUpdateQuote()
  const toast = useToast()
  const [draftReflection, setDraftReflection] = useState<{
    text: string
    provider: string
    model: string
  } | null>(null)
  // AA-D: estado del modal de edición.
  const [editOpen, setEditOpen] = useState(false)

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

  // Drop-cap selectivo: las citas largas (>= 120 caracteres) reciben
  // tratamiento editorial con capital inicial — sin importar si es el
  // feature del Home o una cita más en QuotesView. Las cortas se ven
  // mejor como pull-quote con guillemets y border-left. La heurística
  // del 120 corta justo donde el drop-cap empieza a justificar el peso
  // visual que aporta.
  const isLong = quote.text.length >= 120
  const useDropCap = isFeature || isLong

  return (
    <div className="group">
      {useDropCap ? (
        <blockquote className="quote-block text-lg md:text-xl text-ink-700 leading-snug clear-both overflow-hidden">
          {withDropCap(quote.text)}
        </blockquote>
      ) : (
        <blockquote className="quote-block text-base md:text-lg text-ink-600 leading-relaxed border-l-2 border-ink-200 pl-4">
          «{quote.text}»
        </blockquote>
      )}
      <div
        className={`mt-3 flex justify-between items-baseline gap-4 ${
          useDropCap ? '' : 'pl-5'
        }`}
      >
        <div className="text-sm">
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
            // ρ-fix-B2: cuando la cita está atada a una entidad-obra
            // (libro/ensayo/álbum/canción) Y el source es literalmente el
            // mismo nombre, evitamos imprimirlo dos veces. Ej.: Lao Tse →
            // "Tao Te Ching" (entity link) ·  Tao Te Ching (source italic).
            // El match es case-insensitive con trim para tolerar minucias.
            quote.source.trim().toLowerCase() !== entity?.name.trim().toLowerCase() && (
              <span className="text-ink-300 ml-2 italic">· {quote.source}</span>
            )}
          {quote.origin.kind === 'ai' && (
            <span
              className="ml-1.5 inline-flex items-center text-sky-700/70"
              title="propuesta por IA"
            >
              <SparkleIcon size={10} />
            </span>
          )}
          <span
            className="ml-3 text-caption text-ink-300 tabular-nums"
            title={`Añadida el ${new Date(quote.createdAt).toLocaleString('es')}`}
          >
            añadida {formatDate(quote.createdAt)}
          </span>
        </div>
        {/* ω-E + AA-D: toolbar — ★ favorita (siempre visible) +
            editar (al hover) + eliminar (al hover). */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={async () => {
              const next = !quote.pinnedAt
              try {
                await updateQuote.mutateAsync({
                  id: quote.id,
                  patch: { pinned: next },
                })
              } catch (err) {
                toast.show({
                  message:
                    err instanceof Error
                      ? err.message
                      : 'No se pudo marcar como favorita',
                  tone: 'error',
                })
              }
            }}
            // AA-A: la estrella SIEMPRE visible. Si no está marcada, la
            // silueta ☆ aparece atenuada (ink-300). Al hover sube
            // contraste. Antes solo aparecía en hover, lo que ocultaba
            // la affordance de "puedo marcar esto".
            className={`p-1.5 rounded transition-colors hover:bg-ink-100 ${
              quote.pinnedAt ? 'opacity-100' : 'text-ink-300 hover:text-ink-700'
            }`}
            style={{
              color: quote.pinnedAt ? 'var(--accent-gold)' : undefined,
            }}
            aria-label={quote.pinnedAt ? 'Quitar de favoritas' : 'Marcar como favorita'}
            title={quote.pinnedAt ? 'Quitar de favoritas' : 'Marcar como favorita'}
            aria-pressed={!!quote.pinnedAt}
          >
            <span className="text-sm leading-none" aria-hidden>
              {quote.pinnedAt ? '★' : '☆'}
            </span>
          </button>
          <button
            onClick={() => setEditOpen(true)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 px-2 py-1.5 rounded"
            aria-label="Editar cita"
            title="Editar texto, fuente, contexto o reflexión"
          >
            editar
          </button>
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-ink-400 hover:text-red-700 hover:bg-ink-100 rounded"
            aria-label="Eliminar"
            title="Eliminar"
          >
            <TrashIcon size={12} />
          </button>
        </div>
      </div>
      <QuoteEditModal quote={quote} open={editOpen} onClose={() => setEditOpen(false)} />
      {quote.context && (
        <p
          className={`mt-2 text-ink-400 text-sm leading-relaxed italic ${
            isFeature ? '' : 'pl-5'
          }`}
        >
          {quote.context}
        </p>
      )}
      {quote.userReflection && (
        <div className={`mt-3 ${isFeature ? '' : 'pl-5'}`}>
          <div className="text-micro uppercase tracking-eyebrow text-ink-400 mb-1">
            tu reflexión
          </div>
          {/* μ1: marginalia manuscrita — Caveat 17px / ink-500. Distingue
              la voz tuya de la voz del catálogo (serif) y de la IA (sky). */}
          <p className="marginalia-script whitespace-pre-wrap">{quote.userReflection}</p>
        </div>
      )}
      {quote.aiReflection && (
        <div className={`mt-3 ${isFeature ? '' : 'pl-5'}`}>
          <div className="flex items-baseline gap-1.5 text-micro uppercase tracking-eyebrow text-sky-700/80 mb-1">
            <SparkleIcon size={10} />
            <span>interpretación de la IA</span>
            {/* κ-info: surfacing del modelo detrás del icono "i" — no
                contamina la jerarquía visual y queda a un hover. */}
            <AISourceTag
              provider={quote.aiReflectionProvider}
              model={quote.aiReflectionModel}
              at={quote.aiReflectionAt}
              className="ml-auto"
            />
          </div>
          <p className="text-ink-500 text-sm leading-relaxed whitespace-pre-wrap">
            {quote.aiReflection}
          </p>
        </div>
      )}

      {/* κ6: Reflexión IA bajo demanda. Si todavía no hay y no se está
          dibujando un draft, mostramos un trigger discreto que solo
          aparece al hover de la card (group-hover) — la idea no es
          empujar la función, sino dejarla a un gesto cuando la quieres. */}
      {!quote.aiReflection && !draftReflection && (
        <div
          className={`mt-3 ${isFeature ? '' : 'pl-5'} opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity`}
        >
          <button
            onClick={handleReflect}
            disabled={reflect.isPending}
            className="inline-flex items-center gap-1.5 text-micro uppercase tracking-eyebrow text-sky-700/70 hover:text-sky-700 transition-colors disabled:opacity-60"
          >
            <SparkleIcon size={10} />
            {reflect.isPending ? 'leyendo…' : 'reflexionar con IA'}
          </button>
        </div>
      )}

      {/* κ6: Draft preview — la IA respondió, el usuario decide si la
          guarda. La cabecera deja ver el provider/modelo y un hint de que
          tomó citas vecinas como contexto. */}
      {draftReflection && (
        <div
          className={`mt-3 ${isFeature ? '' : 'pl-5'} animate-fade-up`}
          aria-live="polite"
        >
          <div className="flex items-baseline gap-1.5 text-micro uppercase tracking-eyebrow text-sky-700/80 mb-1">
            <SparkleIcon size={10} />
            <span>lectura cruzada (borrador)</span>
            <AISourceTag
              provider={draftReflection.provider}
              model={draftReflection.model}
              className="ml-auto"
            />
          </div>
          <p className="text-ink-500 text-sm leading-relaxed whitespace-pre-wrap border-l-2 border-sky-700/30 pl-3">
            {draftReflection.text}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={handleSaveReflection}
              disabled={updateQuote.isPending}
              className="text-micro uppercase tracking-eyebrow text-sky-700 hover:text-sky-900 transition-colors disabled:opacity-60"
            >
              {updateQuote.isPending ? 'guardando…' : 'guardar'}
            </button>
            <button
              onClick={handleReflect}
              disabled={reflect.isPending}
              className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors disabled:opacity-60"
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
 * N5: memoizamos para que scroll de QuotesView con 100+ citas no
 * re-renderice cada item al cambiar state global. Tanstack Query mantiene
 * referencias estables; entity/author cambian solo si su row cambia.
 */
export const QuoteItem = memo(QuoteItemInternal, (prev, next) => {
  return (
    prev.quote === next.quote &&
    prev.entity === next.entity &&
    prev.author === next.author &&
    prev.isFeature === next.isFeature
  )
})
