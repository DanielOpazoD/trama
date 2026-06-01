import { useState, type FormEvent } from 'react'
import { SparkleIcon } from '../Icons'

/**
 * Importador de playlist Spotify, colapsable.
 *
 * Por default cerrado — solo se ve un botón discreto "importar
 * playlist". Al click se expande el form. Si llega un error mientras
 * está cerrado, se abre automáticamente para mostrar el mensaje
 * (probablemente el usuario quiere ver el detalle y reintentar).
 */
export function PlaylistImporter({
  value,
  onChange,
  onSubmit,
  isPending,
  error,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  isPending: boolean
  error: unknown
}) {
  const [open, setOpen] = useState(false)
  const hasError = !!error
  const expanded = open || hasError

  return (
    <section className="mb-6">
      {!expanded && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="section-eyebrow hover:text-ink-700 transition-colors inline-flex items-center gap-1.5"
          title="Importar artistas + canciones desde una playlist de Spotify"
        >
          <SparkleIcon size={12} />
          importar playlist
        </button>
      )}
      {expanded && (
        <form
          onSubmit={onSubmit}
          className="p-4 bg-paper-100/40 border border-ink-100/50 rounded-xl animate-fade-up"
        >
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <h3 className="section-eyebrow">importar playlist</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-60"
            >
              cerrar
            </button>
          </div>
          <p className="text-xs text-ink-300 mb-2 italic">
            pega la URL · extrae artistas + canciones con link
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://open.spotify.com/playlist/…"
              className="input-paper flex-1 text-sm"
              disabled={isPending}
              autoFocus
            />
            <button
              type="submit"
              disabled={!value.trim() || isPending}
              className="btn-accent text-xs"
            >
              {isPending ? 'leyendo…' : 'importar'}
            </button>
          </div>
          {hasError && (
            <p className="mt-2 text-xs text-[color:var(--accent-clay)]">
              {error instanceof Error
                ? error.message
                : 'No se pudo importar la playlist.'}
            </p>
          )}
        </form>
      )}
    </section>
  )
}
