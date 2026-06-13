import { useState } from 'react'
import { useDeleteFavorito, useFavoritosQuery, useUpdateFavorito } from '../../state'
import type { Favorito } from '../../api'
import { ViewHeader } from '../ViewHeader'
import { EmptyMessage } from '../EmptyMessage'
import { LoadingHint } from '../LoadingHint'
import { PencilIcon, PinIcon } from '../Icons'
import { hostOf, LinkMediaPreview } from './LinkMediaPreview'

/**
 * Favoritos — páginas marcadas para volver. Entidad propia, separada de la
 * bandeja de recortes: acá no se cura nada al grafo, solo se guardan
 * marcadores (favicon + título + enlace + nota). Pestaña hermana de Recortes.
 */

/**
 * Si la URL es un video de YouTube, devuelve su miniatura. Trama no guarda la
 * imagen: la deriva del id del video, así funciona retroactivamente con los
 * favoritos ya marcados. Soporta watch, youtu.be, shorts, live, embed y links
 * intermedios de YouTube.
 */
export function youtubeThumb(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    let id: string | null = null
    if (host === 'youtu.be') id = u.pathname.slice(1)
    else if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      if (u.pathname === '/attribution_link') {
        const nested = u.searchParams.get('u')
        if (nested)
          return youtubeThumb(new URL(nested, 'https://www.youtube.com').toString())
      }
      id = u.searchParams.get('v')
      if (!id) {
        const parts = u.pathname.split('/').filter(Boolean)
        const videoPrefix = parts.findIndex((part) =>
          ['shorts', 'live', 'embed', 'v'].includes(part),
        )
        if (videoPrefix >= 0) id = parts[videoPrefix + 1] ?? null
      }
    }
    const cleanId = id?.match(/[\w-]{11}/)?.[0]
    if (!cleanId) return null
    // hqdefault siempre existe (480×360, hasta para videos viejos); object-cover
    // recorta las barras del letterbox y la deja en 16:9 limpio.
    return `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`
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
  const thumb = youtubeThumb(f.url)
  const [note, setNote] = useState(f.note ?? '')
  const [editingNote, setEditingNote] = useState(Boolean(f.note))

  function commitNote() {
    const next = note.trim()
    if (!next) setEditingNote(false)
    if ((f.note ?? '') === next) return
    update.mutate({ id: f.id, patch: { note: next || null } })
  }

  return (
    <li className="group relative card-paper-soft p-4 pt-3 transition-shadow hover:shadow-sm">
      <div aria-hidden className="mb-2.5">
        <div className="border-t-2 border-ink-700/60" />
        <div className="mt-0.5 border-t border-ink-200" />
      </div>

      <LinkMediaPreview
        href={f.url}
        host={host}
        dateLabel={formatStamp(f.createdAt)}
        imageUrl={thumb}
        ariaLabel={`Abrir ${f.title || host || 'favorito'}`}
      />

      <div className="min-w-0">
        <a
          href={f.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block font-serif text-xl leading-tight text-ink-700 hover:underline"
        >
          {f.title || host || f.url}
        </a>
      </div>

      {editingNote || note.trim() ? (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
          autoFocus={!note.trim()}
          aria-label="Nota del favorito"
          className="mt-2 w-full bg-transparent font-serif text-sm text-ink-600 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingNote(true)}
          aria-label="Añadir nota al favorito"
          title="Nota"
          className="mt-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-300 transition-colors hover:bg-ink-100/50 hover:text-ink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-300/40"
        >
          <PencilIcon size={12} />
        </button>
      )}

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
