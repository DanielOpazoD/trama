import { useState } from 'react'
import { useDeleteFavorito, useFavoritosQuery, useUpdateFavorito } from '../../state'
import type { Favorito } from '../../api'
import { EmptyMessage } from '../EmptyMessage'
import { ErrorState } from '../ErrorState'
import { LoadingHint } from '../LoadingHint'
import { PencilIcon } from '../Icons'
import { IconButton } from '../IconButton'
import { hostOf, LinkMediaPreview } from './LinkMediaPreview'
import { youtubeThumb } from '../../lib/youtubeThumb'

/**
 * Favoritos — páginas marcadas para volver. Entidad propia, separada de la
 * bandeja de recortes: acá no se cura nada al grafo, solo se guardan
 * marcadores (título + enlace + nota, y miniatura si es un video).
 *
 * Se renderiza SIEMPRE embebido dentro del feed de Notas (segmento Favoritos),
 * así que no trae su propio ViewHeader — el título de la vista «Notas» manda.
 */

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
  const dateLabel = formatStamp(f.createdAt)
  // Único origen de imagen del favorito hoy: la miniatura de YouTube derivada
  // del id del video. Si falla la carga, caemos al eyebrow discreto.
  // TODO: cachear la miniatura server-side (descargar + guardar en blobs) para
  // no depender de i.ytimg.com — fuera de alcance de este pase.
  const [thumb, setThumb] = useState<string | null>(() => youtubeThumb(f.url))
  const [note, setNote] = useState(f.note ?? '')
  const [editingNote, setEditingNote] = useState(Boolean(f.note))

  function commitNote() {
    const next = note.trim()
    if (!next) setEditingNote(false)
    if ((f.note ?? '') === next) return
    update.mutate({ id: f.id, patch: { note: next || null } })
  }

  return (
    <li className="group relative card-paper-soft rounded-xl border border-ink-100/70 p-3.5 transition-shadow hover:shadow-sm">
      {/* La tarjeta hermana de RecorteCard, con su mismo diseño de escritorio:
          la miniatura al LADO del texto desde `md` y acotada a 'mediana' — a
          ancho completo llegaba a ~930×524px de imagen OG para dos líneas de
          texto. En móvil sigue apilada. */}
      <div className="md:flex md:items-start md:gap-4">
        {thumb ? (
          <LinkMediaPreview
            href={f.url}
            host={host}
            dateLabel={dateLabel}
            imageUrl={thumb}
            size="mediana"
            className="md:mb-0 md:shrink-0"
            ariaLabel={`Abrir ${f.title || host || 'favorito'}`}
            onImageError={() => setThumb(null)}
          />
        ) : (
          (host || dateLabel) && (
            <p className="mb-1.5 text-micro uppercase tracking-eyebrow text-ink-300">
              {host}
              {host && dateLabel && ' · '}
              {dateLabel && <span className="tabular-nums">{dateLabel}</span>}
            </p>
          )
        )}

        <div className="min-w-0 md:flex-1">
          <a
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block font-serif text-xl leading-tight text-ink-700 hover:underline"
          >
            {f.title || host || f.url}
          </a>

          {editingNote || note.trim() ? (
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={commitNote}
              autoFocus={!note.trim()}
              aria-label="Nota del favorito"
              className="mt-2 w-full bg-transparent font-serif text-body text-ink-600"
            />
          ) : (
            <IconButton
              onClick={() => setEditingNote(true)}
              label="Añadir nota al favorito"
              title="Nota"
              className="mt-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-300 transition-colors hover:bg-ink-100/50 hover:text-ink-600"
            >
              <PencilIcon size={12} />
            </IconButton>
          )}

          <div className="mt-1.5 flex items-center justify-end">
            {/* Visible en táctil, discreto con puntero: el guard `sm:` es la
                convención que biblioteca ya aplica — un hover-only a secas es
                invisible e indescubrible en móvil. */}
            <button
              onClick={() => remove.mutate(f.id)}
              className="text-micro text-ink-300 transition-opacity hover:text-[color:var(--accent-clay)] sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
            >
              eliminar
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}

export function FavoritosPanel() {
  const {
    data: favoritos = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useFavoritosQuery()

  if (isLoading) return <LoadingHint text="cargando" />

  // Un fetch fallido no es un panel vacío: sin esta rama, un error de carga caía
  // al EmptyMessage («Todavía no marcaste ninguna página»), confundiendo «roto»
  // con «vacío». Solo cuando no hay nada que mostrar; si el refetch falla con
  // datos en mano, conservamos las tarjetas.
  if (isError && favoritos.length === 0) {
    return (
      <ErrorState
        title="No se pudieron cargar los favoritos"
        onRetry={() => refetch()}
        retrying={isFetching}
      />
    )
  }

  if (favoritos.length === 0) {
    return (
      <EmptyMessage
        illustration="weave"
        title="Todavía no marcaste ninguna página."
        body={
          <>
            Desde la extensión de Trama, clic derecho sobre una página → «Guardar como
            favorito», o el botón «favorito» del popup. Aparecerán aquí para volver cuando
            quieras.
          </>
        }
      />
    )
  }

  return (
    <ul className="grid gap-3">
      {favoritos.map((f) => (
        <FavoritoCard key={f.id} favorito={f} />
      ))}
    </ul>
  )
}
