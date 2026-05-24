import { useMemo, useState, type FormEvent } from 'react'
import {
  useInfiniteMomentosQuery,
  useAddMomento,
  useDeleteMomento,
  useToast,
} from '../state'
import type { Momento } from '../types'
import { EndMark, SparkleIcon, TrashIcon } from './Icons'
import { EmptyMessage } from './EmptyMessage'
import { OrnamentBreak } from './Icons'

/**
 * Momentos — la dimensión temporal de la trama.
 *
 * Esta es la fase ξ1: solo `nota` por ahora (texto puro). En ξ2 entran
 * los recortes (URL + autor + fuente) y en ξ3 las fotos. La UI ya está
 * pensada para crecer: el composer tiene un toggle de kind, pero hoy
 * sólo deja crear notas.
 *
 * Vista: timeline cronológico agrupado por día. Cada día con su header
 * tipográfico (fecha en small caps serif), y abajo las entradas del día
 * en orden capturado descendente.
 *
 * El composer es minimal: textarea + botón Guardar. Cuando se guarda,
 * la nota aparece inmediatamente arriba del día actual via TanStack
 * invalidation (optimistic update sería mejor pero invalidate alcanza).
 */

function formatDateHeading(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86_400_000)
  if (diffDays === 0) return 'hoy'
  if (diffDays === 1) return 'ayer'
  return d.toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: target.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  })
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

function groupByDay(items: Momento[]): Array<{ dayKey: string; entries: Momento[] }> {
  const groups = new Map<string, Momento[]>()
  for (const m of items) {
    const d = new Date(m.capturedAt)
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const arr = groups.get(key) ?? []
    arr.push(m)
    groups.set(key, arr)
  }
  // Mantener orden de aparición (los items ya vienen ordenados desc por
  // captured_at) — Map preserva insertion order.
  return Array.from(groups.entries()).map(([dayKey, entries]) => ({
    dayKey,
    entries,
  }))
}

export function MomentosView() {
  const momentosQuery = useInfiniteMomentosQuery()
  const addMomento = useAddMomento()
  const deleteMomento = useDeleteMomento()
  const toast = useToast()

  const items = useMemo(
    () => momentosQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [momentosQuery.data],
  )
  const groups = useMemo(() => groupByDay(items), [items])

  const [draft, setDraft] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || addMomento.isPending) return
    try {
      await addMomento.mutateAsync({
        kind: 'nota',
        payload: { bodyText: text },
      })
      setDraft('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar'
      toast.show({ message: msg, tone: 'error' })
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMomento.mutateAsync(id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo eliminar'
      toast.show({ message: msg, tone: 'error' })
    }
  }

  return (
    <>
      <header className="mb-10">
        <p
          className="section-eyebrow-serif mb-2"
          style={{ color: 'var(--accent-gold)' }}
        >
          ✦ memoria fechada
        </p>
        <h2 className="font-serif text-4xl text-ink-700 leading-none">Momentos</h2>
        <div className="accent-rule mt-3 mb-2" />
        <p className="mt-2 text-sm text-ink-400 leading-relaxed max-w-xl">
          Lo que viste, leíste o pensaste un día concreto. La trama gana
          tiempo. Por ahora notas; pronto recortes del mundo y fotos.
        </p>
      </header>

      {/* Composer — minimal por ahora (solo notas). */}
      <form
        onSubmit={handleSubmit}
        className="mb-10 p-5 bg-paper-100/40 border border-ink-100/60 rounded-xl space-y-3 animate-fade-up"
      >
        <header className="stack-2 pb-3 border-b border-ink-100/60">
          <p
            className="section-eyebrow-serif"
            style={{ color: 'var(--accent-gold)' }}
          >
            nueva entrada
          </p>
          <h3 className="font-serif text-xl text-ink-800 leading-tight">
            ¿Qué viste, leíste o pensaste hoy?
          </h3>
        </header>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Una observación, una idea, un recuerdo del día…"
          rows={3}
          className="input-paper w-full resize-none font-serif text-base leading-relaxed placeholder:italic"
          disabled={addMomento.isPending}
        />
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-caption text-ink-300 italic">
            Se guarda fechado hoy. Después podrás editar la fecha o vincular entidades.
          </p>
          <button
            type="submit"
            disabled={!draft.trim() || addMomento.isPending}
            className="btn-ink"
          >
            {addMomento.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>

      {momentosQuery.isLoading ? (
        <p className="text-ink-300 italic text-sm">Cargando momentos…</p>
      ) : items.length === 0 ? (
        <EmptyMessage
          title="Todavía no hay momentos"
          body={
            <>
              Las entradas que crees acá quedan en una línea de tiempo. Más
              adelante podrás pegar tweets, links, screenshots y fotos —
              hoy, solo notas tuyas para empezar.
            </>
          }
        />
      ) : (
        <div className="space-y-10">
          {groups.map(({ dayKey, entries }) => (
            <section key={dayKey} className="animate-fade-up">
              <div className="mb-3 flex items-baseline gap-3">
                <h3
                  className="section-eyebrow-serif"
                  style={{ color: 'var(--accent-gold)' }}
                >
                  {formatDateHeading(entries[0].capturedAt)}
                </h3>
                <span className="flex-1 h-px bg-ink-100/40" />
                <span className="text-caption text-ink-300 tabular-nums">
                  {entries.length} {entries.length === 1 ? 'entrada' : 'entradas'}
                </span>
              </div>
              <ul className="space-y-4">
                {entries.map((m) => (
                  <MomentoEntry
                    key={m.id}
                    momento={m}
                    onDelete={() => handleDelete(m.id)}
                  />
                ))}
              </ul>
            </section>
          ))}

          {momentosQuery.hasNextPage && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => momentosQuery.fetchNextPage()}
                disabled={momentosQuery.isFetchingNextPage}
                className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
              >
                {momentosQuery.isFetchingNextPage ? 'cargando…' : 'más atrás ↓'}
              </button>
            </div>
          )}

          {!momentosQuery.hasNextPage && items.length >= 5 && (
            <div className="flex flex-col items-center gap-2 pt-8 text-ink-300">
              <OrnamentBreak />
              <EndMark size={14} />
            </div>
          )}
        </div>
      )}
    </>
  )
}

function MomentoEntry({
  momento,
  onDelete,
}: {
  momento: Momento
  onDelete: () => void
}) {
  return (
    <li className="group relative pl-5">
      {/* Marca temporal a la izquierda — italic tipográfico, no chip. */}
      <span
        className="absolute left-0 top-1 text-caption italic text-ink-300 tabular-nums w-12 -ml-1 text-right pr-2 border-r border-ink-100/40"
        aria-hidden="true"
      >
        {formatTime(momento.capturedAt)}
      </span>
      <div className="ml-12">
        {momento.kind === 'nota' && momento.payload.bodyText && (
          <p className="font-serif text-base text-ink-700 leading-relaxed whitespace-pre-wrap">
            {momento.payload.bodyText}
          </p>
        )}
        {/* Recorte y foto se renderizan en ξ2 / ξ3. Placeholder por ahora. */}
        {momento.kind !== 'nota' && (
          <p className="text-caption italic text-ink-400">
            ({momento.kind} — renderer pendiente)
          </p>
        )}
        {momento.origin.kind === 'ai' && (
          <span className="ml-2 inline-flex items-center text-sky-700/70" title="origen IA">
            <SparkleIcon size={10} />
          </span>
        )}
      </div>
      <button
        onClick={onDelete}
        className="absolute right-0 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-ink-400 hover:text-red-700 hover:bg-ink-100 rounded"
        aria-label="Eliminar momento"
        title="Eliminar"
      >
        <TrashIcon size={12} />
      </button>
    </li>
  )
}
