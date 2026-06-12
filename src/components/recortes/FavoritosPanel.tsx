import { useState } from 'react'
import { useDeleteFavorito, useFavoritosQuery, useUpdateFavorito } from '../../state'
import type { Favorito } from '../../api'
import { ViewHeader } from '../ViewHeader'
import { EmptyMessage } from '../EmptyMessage'
import { LoadingHint } from '../LoadingHint'
import { PinIcon } from '../Icons'

/**
 * Favoritos — páginas marcadas para volver. Entidad propia, separada de la
 * bandeja de recortes: acá no se cura nada al grafo, solo se guardan
 * marcadores (favicon + título + enlace + nota). Pestaña hermana de Recortes.
 */

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function formatStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d
    .toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
    .replace(/\./g, '')
}

function FavoritoCard({ favorito: f }: { favorito: Favorito }) {
  const update = useUpdateFavorito()
  const remove = useDeleteFavorito()
  const host = hostOf(f.url)
  const [note, setNote] = useState(f.note ?? '')

  function commitNote() {
    const next = note.trim()
    if ((f.note ?? '') === next) return
    update.mutate({ id: f.id, patch: { note: next || null } })
  }

  return (
    <li className="group relative card-paper-soft p-4 pt-3">
      <div aria-hidden className="mb-2.5">
        <div className="border-t-2 border-ink-700/60" />
        <div className="mt-0.5 border-t border-ink-200" />
      </div>

      <div className="flex items-start gap-2.5">
        {host && (
          <img
            src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`}
            alt=""
            className="mt-0.5 h-4 w-4 shrink-0 rounded-sm"
          />
        )}
        <div className="min-w-0 flex-1">
          <a
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block font-serif text-lead leading-snug text-ink-700 hover:underline"
          >
            {f.title || host || f.url}
          </a>
          <span className="text-micro text-ink-300">
            {host}
            {' · '}
            {formatStamp(f.createdAt)}
          </span>
        </div>
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={commitNote}
        placeholder="añade una nota…"
        aria-label="Nota del favorito"
        className="mt-2 w-full bg-transparent font-serif text-sm text-ink-600 placeholder:text-ink-300 placeholder:italic focus:outline-none"
      />

      <div className="mt-1.5 flex items-center justify-end">
        <button
          onClick={() => remove.mutate(f.id)}
          className="text-micro text-ink-300 opacity-0 transition-opacity hover:text-[color:var(--accent-clay)] group-hover:opacity-100 focus:opacity-100"
        >
          eliminar
        </button>
      </div>
    </li>
  )
}

export function FavoritosPanel() {
  const { data: favoritos = [], isLoading } = useFavoritosQuery()

  return (
    <>
      <ViewHeader
        title="Favoritos"
        icon={<PinIcon size={22} />}
        eyebrow="páginas para volver"
        accent="var(--accent-gold)"
        spacing="tight"
        subtitle="Páginas que marcaste como favoritas desde la extensión. Un marcador para volver: nada se cura al grafo desde aquí."
      />

      {isLoading ? (
        <LoadingHint text="cargando" />
      ) : favoritos.length === 0 ? (
        <EmptyMessage
          illustration="weave"
          title="Todavía no marcaste ninguna página."
          body={
            <>
              Desde la extensión de Trama, clic derecho sobre una página → «Guardar como
              favorito», o el botón «favorito» del popup. Aparecerán aquí para volver
              cuando quieras.
            </>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {favoritos.map((f) => (
            <FavoritoCard key={f.id} favorito={f} />
          ))}
        </ul>
      )}
    </>
  )
}
