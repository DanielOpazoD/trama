import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type SpotifyPlayGroup } from '../api'
import { useAddEntity } from '../state'
import { SparkleIcon } from './Icons'
import type { EntityType, Origin } from '../types'

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

const ENTITY_TYPE_FOR_GROUP: Record<Group, EntityType> = {
  artist: 'persona',
  album: 'album',
  track: 'cancion',
}

export function ListeningView({
  onSelectEntity,
}: {
  onSelectEntity?: (id: string) => void
}) {
  const [group, setGroup] = useState<Group>('artist')
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

  const addEntity = useAddEntity()

  async function handleAccept(item: SpotifyPlayGroup) {
    const type = ENTITY_TYPE_FOR_GROUP[group]
    const origin: Origin = {
      kind: 'imported',
      importedFrom: 'spotify',
      provider: 'spotify',
    }
    const created = await addEntity.mutateAsync({
      type,
      name: item.key,
      description: undefined,
      origin,
    })
    if (created) {
      onSelectEntity?.(created.id)
    }
  }

  const isConnected = statusQuery.data?.connected === true

  return (
    <>
      <header className="mb-10 flex items-baseline justify-between gap-6">
        <div className="min-w-0">
          <h2 className="font-serif text-4xl text-ink-700 leading-none">Escuchas</h2>
          <p className="mt-2 text-sm text-ink-400 leading-relaxed max-w-md">
            Lo que has reproducido en Spotify, agrupado y ordenado por frecuencia.
            Nada de esto está en tu trama todavía — revisa y agrega lo que resuene.
          </p>
        </div>
      </header>

      {!isConnected ? (
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
                  className="group p-3 bg-paper-50/40 border border-ink-100/50 rounded-xl transition-all duration-200 hover:shadow-md hover:shadow-ink-900/5 hover:border-ink-100 hover:bg-paper-50/70 animate-fade-up"
                  style={{ animationDelay: `${Math.min(idx * 30, 240)}ms` }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-3 flex-wrap">
                        <span className="text-ink-700">{item.key}</span>
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
                        <SparkleIcon size={11} />
                        en la trama
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAccept(item)}
                        disabled={addEntity.isPending}
                        className="text-xs px-3 py-1.5 border border-ink-100/60 rounded-md hover:bg-ink-50 active:scale-[0.95] transition-all opacity-0 group-hover:opacity-100 disabled:opacity-30"
                      >
                        añadir a la trama
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
