import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, type SpotifyPlayGroup } from '../api'
import { useAddEntity, useExtract } from '../state'
import { SparkleIcon } from './Icons'
import { MusicPaletteCard } from './MusicPaletteCard'
import { PlaysTiming } from './listening/PlaysTiming'
import { SuggestArtists } from './listening/SuggestArtists'
import type { EntityType, ExtractionProposal, Origin } from '../types'

type Group = 'artist' | 'album' | 'track'

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days < 1) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  if (days < 30) return `hace ${Math.floor(days / 7)} sem`
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}

const GROUP_LABEL: Record<Group, string> = {
  artist: 'Artistas',
  album: 'Álbumes',
  track: 'Canciones',
}

// Default entity types when promoting a Spotify play into the trama. 'artist'
// gets 'musico' because that covers both solo artists and band members; the
// user can reclassify to 'banda' later via the AI button.
const ENTITY_TYPE_FOR_GROUP: Record<Group, EntityType> = {
  artist: 'musico',
  album: 'album',
  track: 'cancion',
}

export function ListeningView({
  onSelectEntity,
  onProposal,
}: {
  onSelectEntity?: (id: string) => void
  onProposal?: (title: string, proposal: ExtractionProposal) => void
}) {
  const [group, setGroup] = useState<Group>('artist')
  // π3: ventana temporal. '90d' es el default histórico del endpoint.
  // Otras opciones: 7d (semana), 30d (mes), 365d (año). El cambio invalida
  // la query (porque entra en la queryKey) y dispara refetch.
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90 | 365>(90)
  const sinceIso = useMemo(
    () => new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString(),
    [periodDays],
  )
  const [playlistInput, setPlaylistInput] = useState('')
  const playsQuery = useQuery({
    queryKey: ['spotify', 'plays', group, periodDays],
    queryFn: () => api.spotifyPlays(group, 60, sinceIso),
    retry: false,
  })
  const statusQuery = useQuery({
    queryKey: ['spotify', 'status'],
    queryFn: () => api.spotifyStatus(),
    retry: false,
  })

  const importPlaylist = useMutation({
    mutationFn: (input: string) => api.importSpotifyPlaylist(input),
  })

  const addEntity = useAddEntity()
  const extract = useExtract()
  // Tracking de qué item está siendo enriquecido por la IA, para mostrar
  // un spinner por fila en vez de un loading global.
  const [enrichingKey, setEnrichingKey] = useState<string | null>(null)

  async function handleImportPlaylist(e: FormEvent) {
    e.preventDefault()
    const input = playlistInput.trim()
    if (!input || importPlaylist.isPending) return
    try {
      const result = await importPlaylist.mutateAsync(input)
      setPlaylistInput('')
      const title = `Playlist · ${result.playlist.name}`
      onProposal?.(title, {
        entities: result.proposal.entities.map((e) => ({
          type: e.type,
          name: e.name,
          year: e.year,
          description: e.description,
          spotifyUrl: e.spotifyUrl,
        })),
        relationships: result.proposal.relationships,
        quotes: result.proposal.quotes,
      })
    } catch {
      // surfaces via importPlaylist.error
    }
  }

  async function handleAccept(item: SpotifyPlayGroup) {
    const type = ENTITY_TYPE_FOR_GROUP[group]
    const spotifyUrl =
      item.spotifyId != null
        ? `https://open.spotify.com/${group}/${item.spotifyId}`
        : null

    // Pedimos a la IA que enriquezca la entidad antes de proponerla. El
    // usuario revisa y decide en el panel lateral, igual que al pegar
    // texto. Si la IA falla (sin key, cap mensual, etc.), caemos al
    // flujo manual de antes.
    setEnrichingKey(item.key)
    const typeLabel =
      type === 'musico'
        ? 'artista solista o músico'
        : type === 'banda'
          ? 'banda'
          : type === 'album'
            ? 'álbum musical'
            : 'canción'

    const hint = [
      `Agrega a mi trama el ${typeLabel} "${item.key}".`,
      spotifyUrl ? `URL de Spotify: ${spotifyUrl}` : '',
      'Devuelve UNA SOLA entidad principal con:',
      '- descripción breve (≤15 palabras) con género/origen/contexto',
      '- año (de inicio del artista, salida del álbum, o lanzamiento de la canción) SOLO si lo sabes con certeza',
      `- type: "${type}" por default, pero si "${item.key}" es claramente una banda (grupo de varios miembros), usa "banda" en su lugar.`,
      'OPCIONALMENTE propuestas de relaciones con entidades existentes de mi trama si tiene sentido sólido (sin especular).',
      'NO inventes citas — el array quotes debe quedar vacío.',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      const proposal = await extract.mutateAsync(hint)

      // Si la IA no incluyó el spotifyUrl en la entidad principal, lo
      // inyectamos. No queremos perder ese dato.
      if (spotifyUrl && proposal.entities.length > 0 && !proposal.entities[0].spotifyUrl) {
        proposal.entities[0].spotifyUrl = spotifyUrl
      }
      onProposal?.(item.key, proposal)
    } catch {
      // Fallback al flujo manual sin IA.
      const origin: Origin = {
        kind: 'imported',
        importedFrom: 'spotify',
        provider: 'spotify',
      }
      const created = await addEntity.mutateAsync({
        type,
        name: item.key,
        spotifyUrl: spotifyUrl ?? undefined,
        origin,
      })
      if (created) {
        onSelectEntity?.(created.id)
      }
    } finally {
      setEnrichingKey(null)
    }
  }

  const isConnected = statusQuery.data?.connected === true
  // Estado intermedio: mientras la query carga, NO sabemos si Spotify
  // está conectado. Antes mostrábamos el mensaje "no conectado" durante
  // ese momento, que parpadeaba al usuario aunque sí estuviera vinculado.
  const isStatusKnown = statusQuery.isFetched

  return (
    <>
      {/* ι6: eyebrow editorial coherente con Sugerencias. */}
      <header className="mb-10 flex items-baseline justify-between gap-6">
        <div className="min-w-0">
          <p className="section-eyebrow-serif mb-2" style={{ color: 'var(--accent-gold)' }}>
            tu música reciente
          </p>
          <h2 className="font-serif text-4xl text-ink-700 leading-none">Escuchas</h2>
          <div className="accent-rule mt-3 mb-2" />
          <p className="mt-2 text-sm text-ink-400 leading-relaxed max-w-xl">
            Lo que has reproducido en Spotify, agrupado y ordenado por frecuencia.
            Nada de esto está en tu trama todavía — revisa y agrega lo que resuene.
          </p>
        </div>
      </header>

      {!isStatusKnown ? (
        <p className="text-ink-300 italic text-sm">Cargando…</p>
      ) : !isConnected ? (
        <div className="p-6 border border-ink-100/60 rounded-xl bg-paper-100/30">
          <p className="text-ink-500 italic leading-relaxed">
            Spotify aún no está conectado.
          </p>
          <p className="text-ink-400 text-sm mt-2">
            Abre <strong>Configuración</strong> en el sidebar y vincula tu cuenta de
            Spotify. Después podrás sincronizar tus reproducciones y revisarlas
            acá.
          </p>
        </div>
      ) : (
        <>
          {/* κ-spotify: paleta musical sintética (saved + top genres +
              décadas + retrato IA). Aparece arriba porque es la mirada
              MÁS sintética que ofrecemos sobre la cuenta de Spotify;
              la lista detallada debajo es el material crudo. */}
          <MusicPaletteCard />

          {/* Playlist importer */}
          <form
            onSubmit={handleImportPlaylist}
            className="mb-8 p-4 bg-paper-100/40 border border-ink-100/50 rounded-xl"
          >
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h3 className="text-micro uppercase tracking-eyebrow text-ink-400">
                importar playlist
              </h3>
              <span className="text-xs text-ink-300">
                pega URL · extrae artistas + canciones con link
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={playlistInput}
                onChange={(e) => setPlaylistInput(e.target.value)}
                placeholder="https://open.spotify.com/playlist/…"
                className="input-paper flex-1"
                disabled={importPlaylist.isPending}
              />
              <button
                type="submit"
                disabled={!playlistInput.trim() || importPlaylist.isPending}
                className="btn-ink text-xs"
              >
                {importPlaylist.isPending ? 'leyendo…' : 'importar'}
              </button>
            </div>
            {importPlaylist.error && (
              <p className="mt-2 text-xs text-red-700">
                {importPlaylist.error instanceof Error
                  ? importPlaylist.error.message
                  : 'No se pudo importar la playlist.'}
              </p>
            )}
          </form>

          {/* π3: período + group selector lado a lado.
              Período define la ventana temporal de TODO el bloque de
              abajo (summary + lista). Cambiarlo refetchea desde el
              servidor (entra a la queryKey). */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div
              className="flex gap-1 p-1 bg-paper-100/60 rounded-lg border border-ink-100/50 w-fit"
              role="tablist"
              aria-label="Ventana temporal"
            >
              {(
                [
                  { days: 7 as const, label: '7d' },
                  { days: 30 as const, label: '30d' },
                  { days: 90 as const, label: '90d' },
                  { days: 365 as const, label: '1a' },
                ]
              ).map(({ days, label }) => (
                <button
                  key={days}
                  onClick={() => setPeriodDays(days)}
                  className={`px-2.5 py-1 rounded text-caption transition-all duration-150 active:scale-95 ${
                    periodDays === days
                      ? 'bg-paper-50 text-ink-700 shadow-sm'
                      : 'text-ink-400 hover:text-ink-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex gap-1 p-1 bg-paper-100/60 rounded-lg border border-ink-100/50 w-fit">
              {(['artist', 'album', 'track'] as Group[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroup(g)}
                  className={`px-3 py-1.5 rounded text-sm transition-all duration-150 active:scale-95 ${
                    group === g
                      ? 'bg-paper-50 text-ink-700 shadow-sm'
                      : 'text-ink-400 hover:text-ink-700'
                  }`}
                >
                  {GROUP_LABEL[g]}
                </button>
              ))}
            </div>
          </div>

          {/* π3: Summary card — totales agregados del período. Si el
              servidor todavía no respondió, mostramos placeholder con
              "—" en los números para no saltar visual al cargar. */}
          <PlaysSummary
            summary={playsQuery.data?.summary}
            periodDays={periodDays}
            loading={playsQuery.isLoading}
          />

          {/* π4: Patrón temporal — heatmap 7×24 (día×hora) + trend 30d.
              Se renderea solo si hay plays en el período (el componente
              devuelve null si no). enabled=true porque ya pasamos el
              check de Spotify connected arriba. */}
          <PlaysTiming since={sinceIso} enabled={true} />

          {/* π5: Sugerencias IA de artistas nuevos. Botón manual — no
              prefetch porque cada call cuesta tokens. El usuario decide
              cuándo pedir. */}
          <SuggestArtists />

          {playsQuery.isLoading ? (
            <p className="text-ink-300 italic">cargando…</p>
          ) : !playsQuery.data || playsQuery.data.items.length === 0 ? (
            <p className="text-ink-400 italic leading-relaxed">
              Aún sin reproducciones registradas. Sincroniza desde Configuración para
              traer las últimas 50 escuchas de Spotify.
            </p>
          ) : (
            <ul className="space-y-2">
              {playsQuery.data.items.map((item, idx) => (
                <li
                  key={`${item.key}-${idx}`}
                  className="group card-paper-hover p-3 hover:shadow-ink-900/5 animate-fade-up"
                  style={{ animationDelay: `${Math.min(idx * 30, 240)}ms` }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-3 flex-wrap">
                        {item.spotifyId ? (
                          <a
                            href={`https://open.spotify.com/${group}/${item.spotifyId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ink-700 hover:text-emerald-700 transition-colors border-b border-transparent hover:border-emerald-700/40"
                            title="Abrir en Spotify"
                          >
                            {item.key}
                          </a>
                        ) : (
                          <span className="text-ink-700">{item.key}</span>
                        )}
                        {/* π3: autoría junto al título cuando el group es
                            track o album — antes solo se veía "Y2K
                            Cataclysm" sin saber de quién. */}
                        {item.artists && item.artists.length > 0 && (
                          <span
                            className="text-xs text-ink-400 italic truncate max-w-[18rem]"
                            title={item.artists.join(', ')}
                          >
                            — {item.artists.slice(0, 2).join(', ')}
                            {item.artists.length > 2 && ` +${item.artists.length - 2}`}
                          </span>
                        )}
                        <span className="text-xs text-ink-400 tabular-nums">
                          {item.plays} {item.plays === 1 ? 'reproducción' : 'reproducciones'}
                        </span>
                        <span className="text-xs text-ink-300">
                          última {formatRelative(item.lastPlayed)}
                        </span>
                      </div>
                    </div>
                    {item.existingEntityId ? (
                      <button
                        onClick={() => onSelectEntity?.(item.existingEntityId!)}
                        className="text-xs px-2.5 py-1 text-ink-400 hover:text-ink-700 transition-colors flex items-center gap-1"
                        title="Ya está en tu trama — abrir su panel"
                      >
                        <SparkleIcon size={12} />
                        en la trama
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAccept(item)}
                        disabled={
                          addEntity.isPending || enrichingKey !== null
                        }
                        className="text-xs px-3 py-1.5 border border-ink-100/60 rounded-md hover:bg-ink-50 active:scale-[0.95] transition-all opacity-0 group-hover:opacity-100 disabled:opacity-30 flex items-center gap-1.5"
                        title="La IA propondrá descripción, año y posibles conexiones"
                      >
                        {enrichingKey === item.key ? (
                          <>
                            <span
                              className="size-3 border-2 rounded-full animate-spin"
                              style={{
                                borderColor: 'var(--accent-primary-ring)',
                                borderTopColor: 'var(--accent-primary)',
                              }}
                            />
                            preparando…
                          </>
                        ) : (
                          <>
                            <SparkleIcon size={12} />
                            añadir a la trama
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}

/**
 * π3: Tarjeta de resumen del período. Cuatro stats grandes en serif +
 * "minutos escuchados" como subtítulo. Formato editorial — no es un
 * dashboard genérico de KPIs sino una "página de inicio" para tu música.
 */
function PlaysSummary({
  summary,
  periodDays,
  loading,
}: {
  summary?: {
    totalPlays: number
    uniqueTracks: number
    uniqueArtists: number
    uniqueAlbums: number
    totalMinutes: number
  }
  periodDays: number
  loading: boolean
}) {
  const formatNum = (n: number | undefined) => {
    if (loading || n == null) return '—'
    return n.toLocaleString('es')
  }
  const hours = useMemo(() => {
    if (loading || !summary) return null
    return Math.round(summary.totalMinutes / 60)
  }, [summary, loading])

  const periodLabel =
    periodDays === 7 ? 'última semana'
    : periodDays === 30 ? 'último mes'
    : periodDays === 90 ? 'últimos 90 días'
    : 'último año'

  return (
    <section
      className="card-paper-elevated px-5 py-4 mb-6 animate-fade-up"
      aria-label={`Resumen de escuchas — ${periodLabel}`}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <p className="section-eyebrow">{periodLabel}</p>
        {hours !== null && hours > 0 && (
          <p className="text-caption text-ink-400 italic tabular-nums">
            {hours} {hours === 1 ? 'hora' : 'horas'} de música
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryStat
          label="reproducciones"
          value={formatNum(summary?.totalPlays)}
          color="var(--type-musico)"
        />
        <SummaryStat
          label="canciones"
          value={formatNum(summary?.uniqueTracks)}
          color="var(--accent-gold)"
        />
        <SummaryStat
          label="artistas"
          value={formatNum(summary?.uniqueArtists)}
          color="var(--type-persona)"
        />
        <SummaryStat
          label="álbumes"
          value={formatNum(summary?.uniqueAlbums)}
          color="var(--accent-sage)"
        />
      </div>
    </section>
  )
}

function SummaryStat({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div>
      <p
        className="font-serif text-2xl leading-none tabular-nums"
        style={{ color }}
      >
        {value}
      </p>
      <p className="text-caption text-ink-400 mt-1">{label}</p>
    </div>
  )
}
