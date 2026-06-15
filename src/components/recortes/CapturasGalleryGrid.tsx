import { useMemo, useState } from 'react'
import type { CaptureItem, Recorte } from '../../api'
import { recorteImageUrl } from '../../api/recortes'
import { useAuthenticatedMediaState } from '../momentos/AuthenticatedMedia'
import type { RecorteThumbSize } from '../../hooks/useRecorteThumbSize'
import { EmptyMessage } from '../EmptyMessage'
import { RecorteLightbox } from './RecorteLightbox'

// Densidad de la grilla según el tamaño elegido (mismo control que las
// miniaturas de la lista). Mismo criterio que AlbumGrid de Momentos.
const GRID_CLASS: Record<RecorteThumbSize, string> = {
  pequena: 'grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-1.5',
  mediana: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5',
  grande: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5',
}

const TRANSPARENT_PX =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/** Celda de la galería: la imagen (authed o externa) recortada a un cuadrado. */
function GalleryCell({ recorte: r }: { recorte: Recorte }) {
  const authedSrc = r.imageKey ? recorteImageUrl(r.imageKey) : null
  const { src, status } = useAuthenticatedMediaState(authedSrc)
  const shown = authedSrc ? (src ?? TRANSPARENT_PX) : (r.imageUrl ?? TRANSPARENT_PX)
  const loading = authedSrc ? status === 'loading' : false
  return (
    <div className="relative aspect-square overflow-hidden rounded-md bg-paper-100/60">
      {loading && (
        <div
          className="absolute inset-0 animate-pulse-subtle bg-ink-100/60"
          aria-hidden
        />
      )}
      <img
        src={shown}
        alt={r.sourceTitle ?? r.text.slice(0, 60)}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.04]"
      />
    </div>
  )
}

/**
 * Vista galería de las capturas con imagen: una grilla tipo álbum (solo las
 * capturas que tienen imagen; las notas y los recortes de solo texto quedan
 * fuera). Al hacer clic, abre el visor (RecorteLightbox) con flechas para
 * recorrer todas las imágenes de la vista.
 *
 * Como evita el virtualizador de la lista, la galería gestiona su propia carga
 * incremental (botón «cargar más») sobre las páginas ya traídas del feed.
 */
export function CapturasGalleryGrid({
  items,
  size,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  items: CaptureItem[]
  size: RecorteThumbSize
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
}) {
  const images = useMemo(
    () =>
      items
        .filter(
          (it): it is Extract<CaptureItem, { type: 'recorte' }> =>
            it.type === 'recorte' && !!(it.recorte.imageKey || it.recorte.imageUrl),
        )
        .map((it) => it.recorte),
    [items],
  )
  const entries = useMemo(
    () =>
      images.map((r) => ({
        url: r.imageKey ? recorteImageUrl(r.imageKey) : (r.imageUrl ?? ''),
        caption: r.sourceTitle ?? r.text,
      })),
    [images],
  )
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  if (images.length === 0) {
    return (
      <EmptyMessage
        title="Sin imágenes por aquí"
        body="No hay capturas con imagen en esta vista. Cuando guardes una foto o un recorte visual, aparecerá en la galería."
      />
    )
  }

  return (
    <>
      <ul className={GRID_CLASS[size]}>
        {images.map((r, i) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setViewerIndex(i)}
              aria-label={`Ampliar ${r.sourceTitle ?? 'imagen'}`}
              className="block w-full overflow-hidden rounded-md border border-ink-100/70 transition-colors hover:border-ink-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            >
              <GalleryCell recorte={r} />
            </button>
          </li>
        ))}
      </ul>

      {hasNextPage && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
            className="text-xs uppercase tracking-eyebrow text-ink-400 transition-colors hover:text-ink-700 disabled:opacity-60"
          >
            {isFetchingNextPage ? 'cargando más…' : 'cargar más'}
          </button>
        </div>
      )}

      <RecorteLightbox
        entries={entries}
        index={viewerIndex ?? 0}
        onIndexChange={setViewerIndex}
        open={viewerIndex !== null}
        onClose={() => setViewerIndex(null)}
      />
    </>
  )
}
