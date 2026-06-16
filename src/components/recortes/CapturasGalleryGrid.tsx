import { useEffect, useMemo, useState } from 'react'
import type { CaptureItem } from '../../api'
import { recorteImageUrl } from '../../api/recortes'
import { useAuthenticatedMediaState } from '../momentos/AuthenticatedMedia'
import type { RecorteThumbSize } from '../../hooks/useRecorteThumbSize'
import { useMainScrollVirtualizer } from '../../hooks/useMainScrollVirtualizer'
import { EmptyMessage } from '../EmptyMessage'
import { RecorteLightbox } from './RecorteLightbox'

// Densidad de la grilla según el tamaño elegido (mismo control que las
// miniaturas de la lista). Mismo criterio que AlbumGrid de Momentos.
const GRID_CLASS: Record<RecorteThumbSize, string> = {
  pequena: 'grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-1.5',
  mediana: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5',
  grande: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5',
}

const ESTIMATED_ROW_HEIGHT: Record<RecorteThumbSize, number> = {
  pequena: 150,
  mediana: 260,
  grande: 420,
}

const TRANSPARENT_PX =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export function getCapturasGalleryColumnCount(
  size: RecorteThumbSize,
  viewportWidth: number,
): number {
  if (size === 'pequena') {
    if (viewportWidth >= 768) return 6
    if (viewportWidth >= 640) return 5
    return 3
  }
  if (size === 'mediana') {
    if (viewportWidth >= 768) return 4
    if (viewportWidth >= 640) return 3
    return 2
  }
  if (viewportWidth >= 768) return 3
  if (viewportWidth >= 640) return 2
  return 1
}

export function chunkCapturasGalleryRows<T>(items: T[], columns: number): T[][] {
  const safeColumns = Math.max(1, columns)
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += safeColumns) {
    rows.push(items.slice(i, i + safeColumns))
  }
  return rows
}

function readViewportWidth(): number {
  if (typeof window === 'undefined') return 1024
  return window.innerWidth || 1024
}

function useGalleryColumns(size: RecorteThumbSize): number {
  const [viewportWidth, setViewportWidth] = useState(readViewportWidth)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setViewportWidth(readViewportWidth())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return getCapturasGalleryColumnCount(size, viewportWidth)
}

/** Una imagen de la galería: blob authed (storageKey) o URL externa. Un
 *  recorte-evento aporta varias. */
type GalleryImage = {
  key: string
  storageKey: string | null
  imageUrl: string | null
  alt: string
}

/** Aplana los recortes con imagen del feed en una imagen por celda. */
export function flattenRecorteImages(items: CaptureItem[]): GalleryImage[] {
  const out: GalleryImage[] = []
  for (const it of items) {
    if (it.type !== 'recorte') continue
    const r = it.recorte
    const alt = r.sourceTitle ?? r.text.slice(0, 60)
    if (r.images.length > 0) {
      r.images.forEach((img, i) =>
        out.push({
          key: `${r.id}:${i}`,
          storageKey: img.storageKey,
          imageUrl: null,
          alt,
        }),
      )
    } else if (r.imageUrl) {
      out.push({ key: r.id, storageKey: null, imageUrl: r.imageUrl, alt })
    }
  }
  return out
}

/** Celda de la galería: la imagen (authed o externa) recortada a un cuadrado. */
function GalleryCell({ cell }: { cell: GalleryImage }) {
  const authedSrc = cell.storageKey ? recorteImageUrl(cell.storageKey) : null
  const { src, status } = useAuthenticatedMediaState(authedSrc)
  const shown = authedSrc ? (src ?? TRANSPARENT_PX) : (cell.imageUrl ?? TRANSPARENT_PX)
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
        alt={cell.alt}
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
  // Una celda por imagen: un recorte-evento aporta todas sus fotos.
  const cells = useMemo(() => flattenRecorteImages(items), [items])
  const entries = useMemo(
    () =>
      cells.map((c) => ({
        url: c.storageKey ? recorteImageUrl(c.storageKey) : (c.imageUrl ?? ''),
        caption: c.alt,
      })),
    [cells],
  )
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const columns = useGalleryColumns(size)
  const rows = useMemo(() => chunkCapturasGalleryRows(cells, columns), [cells, columns])
  const { listRef, virtualizer } = useMainScrollVirtualizer<HTMLDivElement>({
    count: rows.length,
    estimateSize: ESTIMATED_ROW_HEIGHT[size],
    overscan: 3,
    deps: [size, columns, rows.length],
  })
  const estimatedRowHeight = ESTIMATED_ROW_HEIGHT[size]
  const virtualRows = virtualizer.getVirtualItems()
  const totalHeight = Math.max(
    virtualizer.getTotalSize(),
    rows.length * estimatedRowHeight,
  )
  const visibleRows =
    virtualRows.length > 0
      ? virtualRows
      : rows.length > 0 &&
          typeof document !== 'undefined' &&
          document.getElementById('main-scroll')
        ? Array.from({ length: Math.min(rows.length, 8) }, (_, index) => ({
            key: index,
            index,
            start: index * estimatedRowHeight,
          }))
        : rows.map((_, index) => ({
            key: index,
            index,
            start: index * estimatedRowHeight,
          }))

  if (cells.length === 0) {
    return (
      <EmptyMessage
        title="Sin imágenes por aquí"
        body="No hay capturas con imagen en esta vista. Cuando guardes una foto o un recorte visual, aparecerá en la galería."
      />
    )
  }

  return (
    <>
      <div ref={listRef} style={{ height: totalHeight, position: 'relative' }}>
        {visibleRows.map((virtualRow) => {
          const row = rows[virtualRow.index]
          if (!row) return null
          return (
            <ul
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className={GRID_CLASS[size]}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {row.map((cell, offset) => {
                const imageIndex = virtualRow.index * columns + offset
                return (
                  <li key={cell.key}>
                    <button
                      type="button"
                      onClick={() => setViewerIndex(imageIndex)}
                      aria-label={`Ampliar ${cell.alt || 'imagen'}`}
                      className="block w-full overflow-hidden rounded-md border border-ink-100/70 transition-colors hover:border-ink-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                    >
                      <GalleryCell cell={cell} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        })}
      </div>

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
