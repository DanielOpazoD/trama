import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ViewHeader } from './ViewHeader'
import {
  CalendarIcon,
  EndMark,
  SearchIcon,
  SparkleIcon,
  TwitterIcon,
  UserIcon,
} from './Icons'
import { FilterChip } from './FilterChip'
import { XCronicaCard } from './twitter/XCronicaCard'
import { useScrollRail } from '../hooks/useScrollRail'
import { IconButton } from './IconButton'
import { CloseButton } from './CloseButton'
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
  // Chrome on-demand, el patrón que NotasFeedView documenta: el buscador y la
  // navegación temporal se expanden desde un icono. Antes esta vista apilaba
  // CUATRO filas de filtros siempre abiertas — la zona más cargada del repo.
  const [searchOpen, setSearchOpen] = useState(false)
  const [datesOpen, setDatesOpen] = useState(false)
  // A 375px los chips de tema envolvían en tres líneas; el rail los deja en
  // una sola que se desliza, con el mismo degradado de máscara que las
  // pestañas del mundo Notas.
  const railTemas = useScrollRail<HTMLDivElement>()
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
        '¿Eliminar la crónica de tus bookmarks? Puedes generar otra cuando quieras.',
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

  // Estilo activo de los chips de esta vista — el acento del mundo lo lleva
  // el `activeStyle`, la forma la lleva el FilterChip compartido.
  const ACTIVE_CHIP = {
    background: 'var(--accent-primary-soft)',
    color: 'var(--accent-primary)',
  }

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
              {/* Sin bookmarks, el CTA del estado vacío ya ofrece sincronizar:
                  dos botones para la misma acción en la misma pantalla. Se
                  mantiene mientras carga para que la cabecera no parpadee. */}
              {(bookmarks.isLoading || items.length > 0) && (
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="text-caption uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
                >
                  {syncing ? 'sincronizando…' : 'Sincronizar'}
                </button>
              )}
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
          <XCronicaCard
            cronica={cronicaQuery.data?.cronica}
            open={cronicaOpen}
            onToggle={() => setCronicaOpen((v) => !v)}
            onGenerate={handleGenerateCronica}
            onDelete={handleDeleteCronica}
            generating={genCronica.isPending}
            deleting={deleteCronica.isPending}
          />

          {/* Chrome on-demand, como NotasFeedView: una sola fila con lo
              que se usa siempre (los temas) y dos iconos que expanden lo
              ocasional (buscar, fechas). Antes eran cuatro filas abiertas a la
              vez, ≥10 controles fijos antes del primer tweet. */}
          <div className="mb-3 flex items-center gap-1.5">
            <div
              ref={railTemas.ref}
              className="scroll-rail flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto md:flex-wrap md:[mask-image:none] md:overflow-visible"
              data-rail-start={railTemas.hint.inicio}
              data-rail-end={railTemas.hint.fin}
            >
              <FilterChip
                active={topic == null && author == null && year == null && !query}
                onClick={() => {
                  setTopic(null)
                  setAuthor(null)
                  selectYear(null)
                  setQuery('')
                }}
                label="Todo"
                activeStyle={ACTIVE_CHIP}
              />
              {topicCounts.map(([t, n]) => (
                <FilterChip
                  key={t}
                  active={topic === t}
                  onClick={() => setTopic((prev) => (prev === t ? null : t))}
                  label={t}
                  count={n}
                  activeStyle={ACTIVE_CHIP}
                />
              ))}
              {unclassified > 0 && (
                <FilterChip
                  active={topic === UNCLASSIFIED_TOPIC}
                  onClick={() =>
                    setTopic((prev) =>
                      prev === UNCLASSIFIED_TOPIC ? null : UNCLASSIFIED_TOPIC,
                    )
                  }
                  label="sin clasificar"
                  count={unclassified}
                  activeStyle={ACTIVE_CHIP}
                />
              )}
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton
                onClick={() => setSearchOpen((v) => !v)}
                label="Buscar en tus bookmarks"
                aria-expanded={searchOpen}
                className={`touch-target rounded-md p-1.5 transition-colors ${
                  searchOpen || query
                    ? 'bg-ink-100/70 text-ink-700'
                    : 'text-ink-300 hover:bg-ink-100/60 hover:text-ink-700'
                }`}
              >
                <SearchIcon size={14} />
              </IconButton>
              {years.length > 0 && (
                <IconButton
                  onClick={() => setDatesOpen((v) => !v)}
                  label="Filtrar por fecha"
                  aria-expanded={datesOpen}
                  className={`touch-target rounded-md p-1.5 transition-colors ${
                    datesOpen || year != null
                      ? 'bg-ink-100/70 text-ink-700'
                      : 'text-ink-300 hover:bg-ink-100/60 hover:text-ink-700'
                  }`}
                >
                  <CalendarIcon size={14} />
                </IconButton>
              )}
              <IconButton
                onClick={() => setShowAuthors((v) => !v)}
                label="Filtrar por autor"
                aria-expanded={showAuthors}
                className={`touch-target rounded-md p-1.5 transition-colors ${
                  showAuthors || author != null
                    ? 'bg-ink-100/70 text-ink-700'
                    : 'text-ink-300 hover:bg-ink-100/60 hover:text-ink-700'
                }`}
              >
                <UserIcon size={14} />
              </IconButton>
              {/* Clasificar sólo aparece cuando HAY algo que clasificar: antes
                  vivía fijo y deshabilitado en el estado estable más común. */}
              {unclassified > 0 && (
                <button
                  onClick={handleClassify}
                  disabled={classify.isPending}
                  title={`Clasificar ${unclassified} sin tema con IA`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-caption text-ink-400 transition-colors hover:bg-ink-100/60 hover:text-ink-700 disabled:opacity-40"
                >
                  <SparkleIcon size={12} className="text-ink-400" />
                  {classify.isPending ? 'clasificando…' : 'Clasificar temas'}
                </button>
              )}
            </div>
          </div>

          {searchOpen && (
            <div className="mb-3 animate-fade-up">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en tus bookmarks…"
                aria-label="Buscar"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setQuery('')
                    setSearchOpen(false)
                  }
                }}
                className="w-full rounded-lg border border-ink-100/60 bg-paper-50 px-3 py-1.5 text-body text-ink-700 placeholder:text-ink-300 focus:border-ink-300"
              />
            </div>
          )}

          {showAuthors && authors.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-1.5 border-l-2 border-ink-100 pl-3 animate-fade-up">
              {author && (
                <FilterChip
                  active={false}
                  onClick={() => setAuthor(null)}
                  label="✕ quitar filtro"
                />
              )}
              {authors.slice(0, 24).map(([u, n]) => (
                <FilterChip
                  key={u}
                  active={author === u}
                  onClick={() => setAuthor((prev) => (prev === u ? null : u))}
                  label={`@${u}`}
                  count={n}
                  title={`${n} bookmark${n === 1 ? '' : 's'} de @${u}`}
                  activeStyle={ACTIVE_CHIP}
                />
              ))}
            </div>
          )}

          {datesOpen && years.length > 0 && (
            <div className="mb-4 space-y-1.5 border-l-2 border-ink-100 pl-3 animate-fade-up">
              <div className="flex flex-wrap items-center gap-1.5">
                <FilterChip
                  active={year == null}
                  onClick={() => selectYear(null)}
                  label="Todos los años"
                  activeStyle={ACTIVE_CHIP}
                />
                {years.map((y) => (
                  <FilterChip
                    key={y}
                    active={year === y}
                    onClick={() => selectYear(y)}
                    label={String(y)}
                    count={byYear.get(y)?.count}
                    activeStyle={ACTIVE_CHIP}
                  />
                ))}
              </div>
              {year != null && months.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <FilterChip
                    active={month == null}
                    onClick={() => setMonth(null)}
                    label={`Todo ${year}`}
                    activeStyle={ACTIVE_CHIP}
                  />
                  {months.map((m) => (
                    <FilterChip
                      key={m}
                      active={month === m}
                      onClick={() => setMonth((prev) => (prev === m ? null : m))}
                      label={monthName(m)}
                      activeStyle={ACTIVE_CHIP}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {filtered.length === 0 && (
            <p className="py-8 text-center text-body text-ink-400 italic">
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
                <CloseButton
                  onClick={() => handleDelete(b)}
                  disabled={del.isPending}
                  label="Quitar bookmark"
                  size={12}
                  title="Quitar de Trama (no borra de X)"
                  className="absolute right-2 top-2 rounded p-1 text-ink-300 opacity-0 transition-opacity hover:bg-ink-50 hover:text-[color:var(--accent-clay)] group-hover:opacity-100 disabled:opacity-50"
                />
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
