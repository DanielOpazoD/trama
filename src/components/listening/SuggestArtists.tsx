import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, type SpotifyArtistSuggestion } from '../../api'
import { useAddEntity, useToast } from '../../state'
import { SparkleIcon } from '../Icons'
import { AISourceTag } from '../AISourceTag'

/**
 * π5: card "podrían resonarte" — la IA mira tu perfil musical en Spotify
 * (top artists + géneros derivados) y propone 5-8 artistas nuevos que NO
 * están en tu trama y NO son ya tu top.
 *
 * Pensado como descubrimiento liviano, no como recomendación algorítmica
 * pesada. El usuario revisa los chips, decide qué resuena, y los añade
 * con un click. Cada add crea una entidad tipo 'musico' o 'banda' con
 * origin AI y description que viene del LLM.
 *
 * Diseñado para fallar bien: si Spotify está desconectado, si el LLM
 * no responde, si el usuario no tiene top artists todavía — un mensaje
 * editorial honesto en vez de un error genérico.
 */

export function SuggestArtists() {
  const addEntity = useAddEntity()
  const toast = useToast()

  // Local state — no usamos TanStack porque el botón es manual,
  // no queremos prefetch ni refetch automático.
  const [suggestions, setSuggestions] = useState<SpotifyArtistSuggestion[]>([])
  const [provider, setProvider] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  // IDs (índice del array) que ya fueron añadidos a la trama, para
  // ocultar el botón y mostrar checkmark.
  const [acceptedIdxs, setAcceptedIdxs] = useState<Set<number>>(new Set())

  const suggest = useMutation({
    // η1: el botón ya muestra "buscando…" inline; el indicador global
    // de "guardando" sería redundante.
    meta: { silent: true },
    mutationFn: () => api.spotifySuggestArtists(),
    onSuccess: (res) => {
      setSuggestions(res.suggestions)
      setProvider(res.provider)
      setModel(res.model)
      setReason(res.reason ?? null)
      setAcceptedIdxs(new Set())
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'No se pudo sugerir'
      toast.show({ message: msg, tone: 'error' })
    },
  })

  async function handleAdd(s: SpotifyArtistSuggestion, idx: number) {
    try {
      await addEntity.mutateAsync({
        type: s.type,
        name: s.name,
        description: s.description || undefined,
        origin: {
          kind: 'ai',
          provider: provider ?? undefined,
          model: model ?? undefined,
        },
      })
      setAcceptedIdxs((prev) => new Set(prev).add(idx))
      toast.show({
        message: `${s.name} añadido a tu trama`,
        tone: 'success',
      })
    } catch (err) {
      // Si es DuplicateEntityError o cualquier 4xx, surfacing breve.
      const msg = err instanceof Error ? err.message : 'No se pudo añadir'
      toast.show({ message: msg, tone: 'error' })
    }
  }

  return (
    <section
      className="card-paper-elevated px-5 py-4 mb-6 animate-fade-up"
      aria-label="Sugerencias de artistas para descubrir"
    >
      <header className="mb-3 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p
            className="section-eyebrow-serif flex items-center gap-2"
            style={{ color: 'var(--accent-gold)' }}
          >
            <span>✦ podrían resonarte</span>
            {provider && (
              <AISourceTag provider={provider} model={model} />
            )}
          </p>
          {/* ρ-micro: bajamos el subtitle del header — duplicaba la
              explicación que ya está en el empty state ("Click en
              descubrir y la IA te propone…"). En estado lleno tampoco
              aporta. */}
        </div>
        <button
          onClick={() => suggest.mutate()}
          disabled={suggest.isPending}
          className="ai-cta"
          title="Pedir nuevas sugerencias — usa tu top artists de Spotify long-term"
        >
          {suggest.isPending ? (
            <>
              <span
                className="size-3 border-2 rounded-full animate-spin"
                style={{
                  borderColor: 'var(--accent-primary-ring)',
                  borderTopColor: 'var(--accent-primary)',
                }}
              />
              buscando…
            </>
          ) : suggestions.length > 0 ? (
            <>
              <SparkleIcon size={12} />
              otras sugerencias
            </>
          ) : (
            <>
              <SparkleIcon size={12} />
              descubrir
            </>
          )}
        </button>
      </header>

      {/* Estado vacío inicial */}
      {suggestions.length === 0 && !suggest.isPending && !reason && (
        <p className="text-sm text-ink-500 italic leading-relaxed">
          Click en <em>descubrir</em> y la IA te propone artistas afines a tu
          perfil de Spotify, que no están todavía en tu trama.
        </p>
      )}

      {/* Reason del servidor (e.g. "sin top artistas en Spotify") */}
      {reason && suggestions.length === 0 && (
        <p className="text-sm text-ink-400 italic leading-relaxed">{reason}</p>
      )}

      {suggestions.length > 0 && (
        <ul className="space-y-3 mt-2">
          {suggestions.map((s, idx) => {
            const accepted = acceptedIdxs.has(idx)
            return (
              <li
                key={`${s.name}-${idx}`}
                className="flex items-start justify-between gap-3 pl-3 -ml-3 py-2 rounded-md hover:bg-paper-50/40 transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-serif text-base text-ink-700">
                      {s.name}
                    </span>
                    <span className="text-micro uppercase tracking-eyebrow text-ink-400">
                      {s.type === 'banda' ? 'banda' : 'músico'}
                    </span>
                  </div>
                  {s.description && (
                    <p className="text-sm text-ink-500 leading-relaxed mt-0.5">
                      {s.description}
                    </p>
                  )}
                  {s.reason && (
                    <p className="text-caption text-ink-400 italic mt-1">
                      {s.reason}
                    </p>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2 mt-1">
                  <a
                    href={`https://open.spotify.com/search/${encodeURIComponent(
                      s.name,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-emerald-700 transition-colors"
                    title="Buscar en Spotify"
                  >
                    ↗
                  </a>
                  {accepted ? (
                    // π-fix: 'sage-700' no es un token Tailwind — usamos
                    // inline style con la CSS var --accent-sage que sí
                    // existe (definida en index.css y re-tinted por tema).
                    <span
                      className="text-micro uppercase tracking-eyebrow flex items-center gap-1"
                      style={{ color: 'var(--accent-sage)' }}
                    >
                      <span aria-hidden>✓</span>
                      añadido
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAdd(s, idx)}
                      disabled={addEntity.isPending}
                      className="text-micro uppercase tracking-eyebrow text-ink-500 hover:text-ink-700 transition-colors disabled:opacity-50"
                    >
                      añadir
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
