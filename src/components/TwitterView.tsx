import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ViewHeader } from './ViewHeader'
import { CloseIcon, EndMark, SparkleIcon } from './Icons'
import { EmptyMessage } from './EmptyMessage'
import {
  useClassifyBookmarks,
  useCreateNote,
  useDeleteBookmark,
  useExtract,
  useGenerateXCronica,
  useTwitterBookmarksQuery,
  useXCronicaQuery,
  useXStatusQuery,
} from '../state'
import { api, type XBookmark } from '../api'
import type { ExtractionProposal } from '../types'
import { formatRelative } from './settings/_shared'
import { queryKeys } from '../state/queryClient'

/**
 * Vista Twitter — los tweets que marcaste como bookmark en X. Espejo de
 * Escuchas: superficie de lectura, NO de trama. Navegación por año/mes (sobre
 * la fecha del tweet), filtro por tema (clasificado con IA) y borrado
 * (soft-delete, no toca X). El agrupado/filtro se hace client-side: a escala
 * personal traer todo es lo más simple.
 */
const UNCLASSIFIED = '__none__'

function monthName(m: number): string {
  return new Date(2000, m, 1).toLocaleDateString('es', { month: 'long' })
}

export function TwitterView({
  onProposal,
}: {
  onProposal?: (title: string, proposal: ExtractionProposal) => void
}) {
  const queryClient = useQueryClient()
  const status = useXStatusQuery()
  const bookmarks = useTwitterBookmarksQuery()
  const del = useDeleteBookmark()
  const classify = useClassifyBookmarks()
  const cronicaQuery = useXCronicaQuery()
  const genCronica = useGenerateXCronica()
  const extract = useExtract()
  const createNote = useCreateNote()
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [month, setMonth] = useState<number | null>(null)
  const [topic, setTopic] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [author, setAuthor] = useState<string | null>(null)
  const [showAuthors, setShowAuthors] = useState(false)

  const items = useMemo(() => bookmarks.data?.items ?? [], [bookmarks.data])
  const data = status.data
  const connected = data?.connected === true
  const lastSyncedAt = data && data.connected ? data.lastSyncedAt : null

  // Facetas año → meses (con conteo), derivadas de la fecha del tweet.
  const byYear = useMemo(() => {
    const map = new Map<number, { count: number; months: Map<number, number> }>()
    for (const b of items) {
      if (!b.tweetCreatedAt) continue
      const d = new Date(b.tweetCreatedAt)
      const y = d.getFullYear()
      const m = d.getMonth()
      const entry = map.get(y) ?? { count: 0, months: new Map<number, number>() }
      entry.count += 1
      entry.months.set(m, (entry.months.get(m) ?? 0) + 1)
      map.set(y, entry)
    }
    return map
  }, [items])
  const years = useMemo(() => [...byYear.keys()].sort((a, b) => b - a), [byYear])
  const months = useMemo(() => {
    if (year == null) return []
    const ms = byYear.get(year)?.months
    if (!ms) return []
    return [...ms.keys()].sort((a, b) => b - a)
  }, [byYear, year])

  // Facetas por tema + cuántos quedan sin clasificar.
  const topicCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of items) {
      if (b.topic) map.set(b.topic, (map.get(b.topic) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [items])
  const unclassified = useMemo(() => items.filter((b) => !b.topic).length, [items])

  // #5 Constelación de autores: a quién marcás más (top, filtrable al click).
  const authors = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of items) {
      if (b.authorUsername)
        map.set(b.authorUsername, (map.get(b.authorUsername) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((b) => {
      if (year != null) {
        if (!b.tweetCreatedAt) return false
        const d = new Date(b.tweetCreatedAt)
        if (d.getFullYear() !== year) return false
        if (month != null && d.getMonth() !== month) return false
      }
      if (topic != null) {
        if (topic === UNCLASSIFIED) {
          if (b.topic) return false
        } else if (b.topic !== topic) return false
      }
      if (author != null && b.authorUsername !== author) return false
      if (q) {
        const hay =
          `${b.text} ${b.authorName ?? ''} ${b.authorUsername ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, year, month, topic, author, query])

  function selectYear(y: number | null) {
    setYear((prev) => (prev === y ? null : y))
    setMonth(null)
  }

  async function handleSync() {
    setSyncing(true)
    setMessage(null)
    try {
      const r = await api.xSync()
      const cls = r.classified ? ` · ${r.classified} clasificados` : ''
      setMessage(
        r.inserted > 0 ? `${r.inserted} bookmarks nuevos${cls}` : 'Sin bookmarks nuevos',
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.x })
      queryClient.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  async function handleClassify() {
    setMessage(null)
    try {
      const r = await classify.mutateAsync()
      setMessage(
        r.classified > 0
          ? `Clasificados ${r.classified}${r.remaining ? ' · quedan más, clasificá de nuevo' : ''}`
          : 'Nada para clasificar',
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo clasificar')
    }
  }

  async function handleGenerateCronica() {
    setMessage(null)
    try {
      await genCronica.mutateAsync()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo generar la crónica')
    }
  }

  // #1 Promover a la trama — extraer con IA (propone entidades/relaciones para
  // revisar) o guardar como nota (texto crudo, sin IA).
  async function handleExtract(b: XBookmark) {
    if (!onProposal) return
    setPromotingId(b.id)
    setMessage(null)
    try {
      const who = b.authorUsername ? `@${b.authorUsername}` : 'alguien'
      const hint = [
        'Extraé de este tweet las entidades (personas, obras, conceptos) que valga ' +
          'la pena agregar a mi mapa, y relaciones entre ellas si las hay con certeza.',
        `Tweet de ${who}: "${b.text.replace(/"/g, "'").slice(0, 600)}"`,
        'No inventes citas — el array quotes debe quedar vacío.',
      ].join('\n')
      const proposal = await extract.mutateAsync(hint)
      onProposal(who, proposal)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo extraer')
    } finally {
      setPromotingId(null)
    }
  }

  async function handleSaveNote(b: XBookmark) {
    setPromotingId(b.id)
    setMessage(null)
    try {
      const attribution = b.authorUsername ? `\n\n— @${b.authorUsername}` : ''
      const link = b.url ? `\n${b.url}` : ''
      await createNote.mutateAsync(`${b.text}${attribution}${link}`)
      setMessage('Guardado en Notas')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar la nota')
    } finally {
      setPromotingId(null)
    }
  }

  function handleDelete(b: XBookmark) {
    if (!confirm('¿Quitar este bookmark de Trama? No se borra de tu cuenta de X.')) {
      return
    }
    del.mutate(b.id)
  }

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors ${
      active
        ? 'bg-ink-100 text-ink-800'
        : 'text-ink-400 hover:bg-ink-100/60 hover:text-ink-700'
    }`

  return (
    <>
      <ViewHeader
        title="Twitter"
        eyebrow="tus marcadores"
        accent="var(--accent-primary)"
        eyebrowColor="var(--accent-gold)"
        spacing="wide"
        subtitle="Los tweets que marcaste como bookmark en X. Viven aparte — nada entra a tu trama hasta que lo decidas."
        action={
          connected ? (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
              >
                {syncing ? 'sincronizando…' : 'Sincronizar'}
              </button>
              <span className="text-micro text-ink-300 tabular-nums">
                {lastSyncedAt
                  ? `sincronizado ${formatRelative(lastSyncedAt)}`
                  : 'sin sincronizar'}
              </span>
            </div>
          ) : undefined
        }
      />

      {message && (
        <p className="mb-6 text-xs text-ink-500 italic animate-fade-up">{message}</p>
      )}

      {status.isLoading || bookmarks.isLoading ? (
        <p className="text-xs text-ink-300 italic">cargando…</p>
      ) : !connected ? (
        <EmptyMessage
          illustration="thread"
          title="X no está conectado"
          body="Conectá tu cuenta de X en Configuración → X (Twitter) para traer tus tweets marcados."
        />
      ) : items.length === 0 ? (
        <EmptyMessage
          illustration="thread"
          title="Sin bookmarks todavía"
          body="Marcá tweets como bookmark en X y sincronizá para verlos acá."
          action={
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn-accent text-xs disabled:opacity-50"
            >
              {syncing ? 'sincronizando…' : 'Sincronizar ahora'}
            </button>
          }
        />
      ) : (
        <>
          {/* #4 Crónica IA de tus bookmarks (se guarda y aparece en Inicio). */}
          {(() => {
            const c = cronicaQuery.data?.cronica
            return (
              <div className="card-paper mb-6 p-4">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="section-eyebrow-serif">Crónica de tus bookmarks</span>
                  <button
                    onClick={handleGenerateCronica}
                    disabled={genCronica.isPending}
                    className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
                  >
                    {genCronica.isPending ? 'escribiendo…' : c ? 'Regenerar' : 'Generar'}
                  </button>
                </div>
                {c ? (
                  <>
                    <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-ink-700">
                      {c.text}
                    </p>
                    <p className="mt-2 text-micro text-ink-300 tabular-nums">
                      {formatRelative(c.generatedAt)} · {c.sourceCount} bookmarks
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-ink-400 italic">
                    Un ensayo breve, escrito por la IA, sobre qué venís guardando en X.
                  </p>
                )}
              </div>
            )
          })()}

          {/* Buscar + autores. */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en tus bookmarks…"
              className="min-w-0 flex-1 rounded-lg border border-ink-100/60 bg-paper-50 px-3 py-1.5 text-sm text-ink-700 placeholder:text-ink-300 focus:border-ink-300"
            />
            <button
              onClick={() => setShowAuthors((v) => !v)}
              className={chip(showAuthors || author != null)}
            >
              Autores
              {author && <span className="ml-1 text-ink-500">· @{author}</span>}
            </button>
          </div>
          {showAuthors && authors.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-1.5 border-l-2 border-ink-100 pl-3">
              {author && (
                <button onClick={() => setAuthor(null)} className={chip(false)}>
                  ✕ quitar filtro
                </button>
              )}
              {authors.slice(0, 24).map(([u, n]) => (
                <button
                  key={u}
                  onClick={() => setAuthor((prev) => (prev === u ? null : u))}
                  className={chip(author === u)}
                  title={`${n} bookmark${n === 1 ? '' : 's'} de @${u}`}
                >
                  @{u}
                  <span className="ml-1 text-micro text-ink-300 tabular-nums">{n}</span>
                </button>
              ))}
            </div>
          )}

          {/* Temas (clasificación IA) + botón clasificar. */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <button onClick={() => setTopic(null)} className={chip(topic == null)}>
              Todos los temas
            </button>
            {topicCounts.map(([t, n]) => (
              <button
                key={t}
                onClick={() => setTopic((prev) => (prev === t ? null : t))}
                className={chip(topic === t)}
              >
                {t}
                <span className="ml-1 text-micro text-ink-300 tabular-nums">{n}</span>
              </button>
            ))}
            {unclassified > 0 && (
              <button
                onClick={() =>
                  setTopic((prev) => (prev === UNCLASSIFIED ? null : UNCLASSIFIED))
                }
                className={chip(topic === UNCLASSIFIED)}
              >
                sin clasificar
                <span className="ml-1 text-micro text-ink-300 tabular-nums">
                  {unclassified}
                </span>
              </button>
            )}
            <button
              onClick={handleClassify}
              disabled={classify.isPending || unclassified === 0}
              title={
                unclassified === 0
                  ? 'Todo clasificado'
                  : `Clasificar ${unclassified} sin tema con IA`
              }
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs text-ink-400 transition-colors hover:bg-ink-100/60 hover:text-ink-700 disabled:opacity-40"
            >
              <SparkleIcon size={12} className="text-ink-400" />
              {classify.isPending ? 'clasificando…' : 'Clasificar temas'}
            </button>
          </div>

          {/* Navegación por año (y mes al elegir un año) — sobre la fecha del tweet. */}
          {years.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <button onClick={() => selectYear(null)} className={chip(year == null)}>
                Todos los años
              </button>
              {years.map((y) => (
                <button
                  key={y}
                  onClick={() => selectYear(y)}
                  className={chip(year === y)}
                >
                  {y}
                  <span className="ml-1 text-micro text-ink-300 tabular-nums">
                    {byYear.get(y)?.count}
                  </span>
                </button>
              ))}
            </div>
          )}
          {year != null && months.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center gap-1.5 border-l-2 border-ink-100 pl-3">
              <button onClick={() => setMonth(null)} className={chip(month == null)}>
                Todo {year}
              </button>
              {months.map((m) => (
                <button
                  key={m}
                  onClick={() => setMonth((prev) => (prev === m ? null : m))}
                  className={chip(month === m)}
                >
                  {monthName(m)}
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-400 italic">
              Ningún bookmark coincide con el filtro.
            </p>
          )}

          <ul className="space-y-4">
            {filtered.map((b) => (
              <li key={b.id} className="group relative card-paper-soft p-4">
                <button
                  onClick={() => handleDelete(b)}
                  disabled={del.isPending}
                  aria-label="Quitar bookmark"
                  title="Quitar de Trama (no borra de X)"
                  className="absolute right-2 top-2 rounded p-1 text-ink-300 opacity-0 transition-opacity hover:bg-ink-50 hover:text-red-700 group-hover:opacity-100 disabled:opacity-50"
                >
                  <CloseIcon size={12} />
                </button>
                <div className="flex items-baseline justify-between gap-3 pr-6">
                  <span className="min-w-0 truncate text-sm text-ink-700">
                    {b.authorName ?? 'desconocido'}
                    {b.authorUsername && (
                      <span className="text-ink-400"> @{b.authorUsername}</span>
                    )}
                  </span>
                  {b.tweetCreatedAt && (
                    <span className="shrink-0 text-micro text-ink-300 tabular-nums">
                      {new Date(b.tweetCreatedAt).toLocaleDateString('es', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">
                  {b.text}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  {b.url && (
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-micro hover:underline"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      ver en X ↗
                    </a>
                  )}
                  {b.topic && (
                    <span className="text-micro uppercase tracking-eyebrow text-ink-300">
                      {b.topic}
                    </span>
                  )}
                  {/* #1 Promover a la trama — aparecen al hover. */}
                  <span className="ml-auto flex items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100">
                    {onProposal && (
                      <button
                        onClick={() => handleExtract(b)}
                        disabled={promotingId === b.id}
                        title="Extraer entidades/relaciones con IA para revisar"
                        className="text-micro text-ink-400 hover:text-ink-700 transition-colors disabled:opacity-50"
                      >
                        {promotingId === b.id ? 'extrayendo…' : '+ extraer (IA)'}
                      </button>
                    )}
                    <button
                      onClick={() => handleSaveNote(b)}
                      disabled={promotingId === b.id}
                      title="Guardar el texto del tweet como nota"
                      className="text-micro text-ink-400 hover:text-ink-700 transition-colors disabled:opacity-50"
                    >
                      + nota
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex justify-center">
            <EndMark />
          </div>
        </>
      )}
    </>
  )
}
