import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ViewHeader } from './ViewHeader'
import {
  CloseIcon,
  EndMark,
  SparkleIcon,
  TwitterIcon,
  ChevronDownIcon,
  TrashIcon,
} from './Icons'
import { AISourceTag } from './AISourceTag'
import { EmptyMessage } from './EmptyMessage'
import { LoadingHint } from './LoadingHint'
import {
  useClassifyBookmarks,
  useCreateNote,
  useDeleteBookmark,
  useExtract,
  useGenerateXCronica,
  useDeleteXCronica,
  useTwitterBookmarksQuery,
  useXCronicaQuery,
  useXStatusQuery,
} from '../state'
import { api, type XBookmark } from '../api'
import type { ExtractionProposal } from '../types'
import { formatRelative } from './settings/_shared'
import { queryKeys } from '../state/queryClient'
import {
  UNCLASSIFIED_TOPIC,
  buildTwitterFacets,
  filterTwitterBookmarks,
  monthName,
} from './twitterViewModel'

/**
 * Vista Twitter — los tweets que marcaste como bookmark en X. Espejo de
 * Escuchas: superficie de lectura, NO de trama. Navegación por año/mes (sobre
 * la fecha del tweet), filtro por tema (clasificado con IA) y borrado
 * (soft-delete, no toca X). El agrupado/filtro se hace client-side: a escala
 * personal traer todo es lo más simple.
 */
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
  const deleteCronica = useDeleteXCronica()
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
  // La crónica arranca visible pero se puede colapsar (ocultar) sin borrarla.
  const [cronicaOpen, setCronicaOpen] = useState(true)

  const items = useMemo(() => bookmarks.data?.items ?? [], [bookmarks.data])
  const data = status.data
  const connected = data?.connected === true
  const lastSyncedAt = data && data.connected ? data.lastSyncedAt : null

  const facets = useMemo(() => buildTwitterFacets(items), [items])
  const years = facets.years
  const months = useMemo(() => facets.monthsForYear(year), [facets, year])
  const { byYear, topicCounts, unclassified, authors } = facets

  const filtered = useMemo(() => {
    return filterTwitterBookmarks(items, { year, month, topic, author, query })
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

  async function handleDeleteCronica() {
    if (
      !confirm(
        '¿Eliminar la crónica de tus bookmarks? Podés generar otra cuando quieras.',
      )
    ) {
      return
    }
    setMessage(null)
    try {
      await deleteCronica.mutateAsync()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo eliminar la crónica')
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
      await createNote.mutateAsync({ content: `${b.text}${attribution}${link}` })
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
        icon={<TwitterIcon size={22} />}
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
        <LoadingHint text="cargando" />
      ) : !connected ? (
        <EmptyMessage
          illustration="thread"
          title="X no está conectado"
          body="Conecta tu cuenta de X en Configuración → X (Twitter) para traer tus tweets marcados."
        />
      ) : items.length === 0 ? (
        <EmptyMessage
          illustration="thread"
          title="Sin bookmarks todavía"
          body="Marca tweets como bookmark en X y sincroniza para verlos aquí."
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
                <div className="flex items-baseline justify-between gap-3">
                  {c ? (
                    <button
                      type="button"
                      onClick={() => setCronicaOpen((v) => !v)}
                      aria-expanded={cronicaOpen}
                      className="flex items-baseline gap-1.5 hover:opacity-80 transition-opacity"
                      title={cronicaOpen ? 'Ocultar la crónica' : 'Mostrar la crónica'}
                    >
                      <span className="section-eyebrow-serif">
                        Crónica de tus bookmarks
                      </span>
                      <ChevronDownIcon
                        size={12}
                        className={`text-ink-300 transition-transform ${cronicaOpen ? '' : '-rotate-90'}`}
                      />
                    </button>
                  ) : (
                    <span className="section-eyebrow-serif">
                      Crónica de tus bookmarks
                    </span>
                  )}
                  <div className="flex items-center gap-3 shrink-0">
                    {c && (
                      <AISourceTag
                        provider={c.provider}
                        model={c.model}
                        at={c.generatedAt}
                      />
                    )}
                    <button
                      onClick={handleGenerateCronica}
                      disabled={genCronica.isPending}
                      className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
                    >
                      {genCronica.isPending
                        ? 'escribiendo…'
                        : c
                          ? 'Regenerar'
                          : 'Generar'}
                    </button>
                    {c && (
                      <button
                        onClick={handleDeleteCronica}
                        disabled={deleteCronica.isPending}
                        aria-label="Eliminar crónica"
                        title="Eliminar la crónica (podés generar otra cuando quieras)"
                        className="rounded p-1 text-ink-300 hover:text-[color:var(--accent-clay)] transition-colors disabled:opacity-50"
                      >
                        <TrashIcon size={12} />
                      </button>
                    )}
                  </div>
                </div>
                {c ? (
                  cronicaOpen && (
                    <div className="mt-2 animate-fade-up">
                      <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-ink-700">
                        {c.text}
                      </p>
                      <p className="mt-2 text-micro text-ink-300 tabular-nums">
                        {formatRelative(c.generatedAt)} · {c.sourceCount} bookmarks
                      </p>
                    </div>
                  )
                ) : (
                  <p className="mt-1 text-sm text-ink-400 italic">
                    Un ensayo breve, escrito por la IA, sobre qué guardas en X.
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
            <span className="mr-1 self-center text-micro uppercase tracking-eyebrow text-ink-300">
              tema
            </span>
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
                  setTopic((prev) =>
                    prev === UNCLASSIFIED_TOPIC ? null : UNCLASSIFIED_TOPIC,
                  )
                }
                className={chip(topic === UNCLASSIFIED_TOPIC)}
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
              <span className="mr-1 self-center text-micro uppercase tracking-eyebrow text-ink-300">
                año
              </span>
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

          {/* Recortes de prensa: cada bookmark como clipping de diario —
              doble filete arriba, byline serif, fecha como sello y el texto
              en tipografía de columna. El gesto: lo guardado en X entra al
              archivo como recorte, no como feed. */}
          <ul className="space-y-4">
            {filtered.map((b) => (
              <li key={b.id} className="group relative card-paper-soft p-4 pt-3">
                <div aria-hidden className="mb-2.5">
                  <div className="border-t-2 border-ink-700/60" />
                  <div className="mt-0.5 border-t border-ink-200" />
                </div>
                <button
                  onClick={() => handleDelete(b)}
                  disabled={del.isPending}
                  aria-label="Quitar bookmark"
                  title="Quitar de Trama (no borra de X)"
                  className="absolute right-2 top-2 rounded p-1 text-ink-300 opacity-0 transition-opacity hover:bg-ink-50 hover:text-[color:var(--accent-clay)] group-hover:opacity-100 disabled:opacity-50"
                >
                  <CloseIcon size={12} />
                </button>
                <div className="flex items-baseline justify-between gap-3 pr-6">
                  <span className="min-w-0 truncate font-serif text-sm font-medium text-ink-700">
                    {b.authorName ?? 'desconocido'}
                    {b.authorUsername && (
                      <span className="font-sans font-normal text-ink-400">
                        {' '}
                        @{b.authorUsername}
                      </span>
                    )}
                  </span>
                  {b.tweetCreatedAt && (
                    // Fecha-sello: como el timbre de hemeroteca en el recorte.
                    <span className="shrink-0 -rotate-2 rounded-sm border border-ink-200 px-1.5 py-0.5 text-micro uppercase tracking-wider text-ink-400 tabular-nums">
                      {new Date(b.tweetCreatedAt).toLocaleDateString('es', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap font-serif text-lead leading-relaxed text-ink-700">
                  {b.text}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  {b.url && (
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-micro hover:underline"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      <TwitterIcon size={11} />
                      ver en X
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
