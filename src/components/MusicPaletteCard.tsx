import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, type SpotifyLibrarySnapshot } from '../api'
import { SparkleIcon } from './Icons'
import { AISourceTag } from './AISourceTag'
import { AIThinkingLabel } from './AIThinkingLabel'

/**
 * κ-spotify: Card "tu paleta musical" — retrato sintético de los gustos del
 * usuario en Spotify (saved count + top géneros + décadas + un párrafo IA
 * que las lee como un crítico amable, no como una lista).
 *
 * El snapshot se cachea en localStorage 'trama:music-palette' para que la
 * card se llene instantáneamente al abrir Escuchas sin pegar Spotify cada
 * vez. Si el cache tiene más de STALE_MS días, mostramos un hint sutil
 * "actualizar paleta" — pero nunca regeneramos automáticamente. El usuario
 * decide cuándo quiere otra lectura.
 *
 * Si nunca se generó: card empty-state con CTA "generar paleta".
 */

const STORAGE_KEY = 'trama:music-palette'
const STALE_MS = 7 * 24 * 60 * 60 * 1000 // 7 días

type CachedSnapshot = {
  generatedAt: string
  data: SpotifyLibrarySnapshot
}

function readCached(): CachedSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedSnapshot
    if (!parsed.generatedAt || !parsed.data) return null
    return parsed
  } catch {
    return null
  }
}

function writeCached(snapshot: CachedSnapshot): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    /* localStorage disabled */
  }
}

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function MusicPaletteCard() {
  const [cached, setCached] = useState<CachedSnapshot | null>(() => readCached())

  // Recarga del cache al montar — si otra pestaña lo actualizó.
  useEffect(() => {
    setCached(readCached())
  }, [])

  const generate = useMutation({
    // Silent: la card muestra su propio "leyendo…" inline; el indicador
    // global "guardando" sería redundante (η1 pattern).
    meta: { silent: true },
    mutationFn: () => api.spotifyLibrarySnapshot(),
    onSuccess: (data) => {
      const snapshot: CachedSnapshot = {
        generatedAt: new Date().toISOString(),
        data,
      }
      writeCached(snapshot)
      setCached(snapshot)
    },
  })

  const isStale = useMemo(() => {
    if (!cached) return false
    const age = Date.now() - new Date(cached.generatedAt).getTime()
    return age > STALE_MS
  }, [cached])

  // Max decade count para escalar las barras
  const maxDecadeCount = useMemo(() => {
    if (!cached) return 0
    return cached.data.decades.reduce((max, d) => Math.max(max, d.count), 0)
  }, [cached])

  if (!cached) {
    // Empty state — invitación, no card vacía.
    return (
      <section
        className="mb-8 p-5 bg-paper-100/40 border border-ink-100/60 rounded-xl"
        aria-label="Tu paleta musical"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p
              className="section-eyebrow-serif mb-1"
              style={{ color: 'var(--accent-gold)' }}
            >
              tu paleta musical
            </p>
            <p className="text-sm text-ink-500 italic leading-relaxed">
              La IA puede mirar tus me-gusta y top artistas y describirte el tono de lo
              que escuchas — géneros, décadas, afinidades.
            </p>
          </div>
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="btn-accent inline-flex items-center gap-1.5 text-xs shrink-0"
          >
            {generate.isPending ? (
              <AIThinkingLabel tone="inverse" text="leyendo" />
            ) : (
              'generar paleta'
            )}
          </button>
        </div>
        {generate.error && (
          <p className="mt-2 text-xs text-[color:var(--accent-clay)]">
            {generate.error instanceof Error
              ? generate.error.message
              : 'No se pudo generar la paleta.'}
          </p>
        )}
      </section>
    )
  }

  const { data } = cached
  const generatedLabel = formatGeneratedAt(cached.generatedAt)

  return (
    <section
      className="mb-8 p-5 bg-paper-100/40 border border-ink-100/60 rounded-xl animate-fade-up"
      aria-label="Tu paleta musical"
    >
      <header className="flex items-baseline justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p
            className="section-eyebrow-serif mb-1 flex items-center gap-2"
            style={{ color: 'var(--accent-gold)' }}
          >
            <span>tu paleta musical</span>
            <AISourceTag
              provider={data.provider}
              model={data.model}
              at={cached.generatedAt}
            />
          </p>
          <p className="text-caption text-ink-300 italic">
            Retrato compuesto el {generatedLabel}
            {isStale && <span className="text-ink-400"> · ya pasó una semana</span>}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="section-eyebrow hover:text-ink-700 transition-colors disabled:opacity-60"
          >
            {generate.isPending ? <AIThinkingLabel text="releyendo" /> : 'actualizar'}
          </button>
          {/* σ-followup: eliminar la paleta — vuelve al empty state con
              el botón "generar paleta". Útil cuando el retrato ya no
              representa tus gustos actuales o querés empezar limpio. */}
          <button
            onClick={() => {
              if (
                typeof window !== 'undefined' &&
                window.confirm(
                  '¿Eliminar tu paleta musical? Puedes generarla de nuevo cuando quieras.',
                )
              ) {
                try {
                  window.localStorage.removeItem(STORAGE_KEY)
                } catch {
                  /* localStorage disabled */
                }
                setCached(null)
              }
            }}
            className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-[color:var(--accent-clay)] transition-colors"
            title="Eliminar la paleta guardada"
          >
            eliminar
          </button>
        </div>
      </header>

      {data.aiSummary && (
        <p className="font-serif text-base leading-relaxed text-ink-600 italic mb-5 pl-4 border-l-2 border-[color:var(--accent-primary-ring)]">
          {data.aiSummary}
        </p>
      )}

      {!data.aiSummary && data.aiError && (
        <p className="text-caption italic text-ink-400 mb-4">
          (La IA no pudo redactar el retrato. Los datos crudos siguen abajo.)
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {/* Top géneros */}
        {data.topGenres.length > 0 && (
          <div>
            <h3 className="section-eyebrow mb-2">géneros que más pesan</h3>
            <ul className="flex flex-wrap gap-1.5">
              {data.topGenres.slice(0, 8).map((g) => (
                <li
                  key={g.name}
                  className="text-caption px-2.5 py-1 rounded-full bg-paper-50/60 text-ink-600 border border-ink-100/60"
                >
                  {g.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Distribución por décadas */}
        {data.decades.length > 0 && (
          <div>
            <h3 className="section-eyebrow mb-2">décadas (top tracks)</h3>
            <ul className="space-y-1">
              {data.decades.map((d) => (
                <li key={d.decade} className="flex items-center gap-2 text-caption">
                  <span className="font-mono text-ink-500 w-12 shrink-0">{d.decade}</span>
                  <span
                    className="h-1.5 rounded-full bg-[color:var(--accent-primary)]"
                    style={{
                      width: `${maxDecadeCount > 0 ? (d.count / maxDecadeCount) * 100 : 0}%`,
                      minWidth: '8px',
                    }}
                  />
                  <span className="font-mono text-ink-400 tabular-nums">{d.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="mt-5 pt-4 border-t border-ink-100/50 text-caption text-ink-400 flex items-center gap-3 flex-wrap">
        {/* ρ-micro: oculta el "0 canciones con corazón" cuando el usuario
            no tiene saved tracks — el cero implícito leía como "tu música
            no te conmueve" sin querer. Si hay >=1, lo mostramos. */}
        {data.savedCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <SparkleIcon size={10} className="text-[color:var(--accent-primary)]" />
            {data.savedCount.toLocaleString('es')} canciones con corazón
          </span>
        )}
        {data.topArtists.length > 0 && (
          <span>
            {data.savedCount > 0 && '· '}top artistas:{' '}
            <span className="text-ink-600">
              {data.topArtists
                .slice(0, 5)
                .map((a) => a.name)
                .join(' · ')}
            </span>
          </span>
        )}
      </footer>
    </section>
  )
}
