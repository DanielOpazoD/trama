import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, type SpotifyPlayGroup } from '../api'
import { useAddEntity, useExtract } from '../state'
import { SparkleIcon } from './Icons'
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
  const [playlistInput, setPlaylistInput] = useState('')
  const playsQuery = useQuery({
    queryKey: ['spotify', 'plays', group],
    queryFn: () => api.spotifyPlays(group, 60),
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
      <header className="mb-10 flex items-baseline justify-between gap-6">
        <div className="min-w-0">
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

          {/* Group selector */}
          <div className="flex gap-1 p-1 bg-paper-100/60 rounded-lg border border-ink-100/50 w-fit mb-6">
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
