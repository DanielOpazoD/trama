import type { ReactNode } from 'react'
import type { NotasFeedSegment } from './notasFeedViewModel'
import { EmptyMessage } from '../EmptyMessage'
import { InlineLoadingLabel } from '../InlineLoadingLabel'
import { LoadingHint } from '../LoadingHint'
import { FeedSkeleton } from './FeedSkeleton'

export function NotasFeedContent({
  segment,
  uploadingImages,
  isLoading,
  isError,
  everythingEmpty,
  itemCount,
  hasContentFilter,
  galleryMode,
  isFetchingNextPage,
  onFocusComposer,
  onClearFilters,
  favoritosPanel,
  gallery,
  list,
}: {
  segment: NotasFeedSegment
  uploadingImages: number
  isLoading: boolean
  isError: boolean
  everythingEmpty: boolean
  itemCount: number
  hasContentFilter: boolean
  galleryMode: boolean
  isFetchingNextPage: boolean
  onFocusComposer: () => void
  onClearFilters: () => void
  favoritosPanel: ReactNode
  gallery: ReactNode
  list: ReactNode
}) {
  if (segment === 'favoritos') return <>{favoritosPanel}</>

  return (
    <>
      {uploadingImages > 0 && (
        <ul className="mb-2.5 space-y-2.5" aria-live="polite">
          {Array.from({ length: uploadingImages }).map((_, index) => (
            <li
              key={index}
              className="card-paper-soft flex items-center gap-2 p-4 text-caption text-ink-400"
            >
              <LoadingHint text="subiendo imagen" size="sm" />
            </li>
          ))}
        </ul>
      )}

      {isLoading ? (
        <FeedSkeleton />
      ) : isError ? (
        <EmptyMessage
          illustration="thread"
          title="No pudimos cargar tus notas y capturas."
          body={<>Vuelve a intentarlo en unos segundos.</>}
        />
      ) : everythingEmpty ? (
        <EmptyMessage
          illustration="thread"
          title="Tu primer apunte, todavía sin escribir."
          body={<>Un apunte breve alcanza. Tus recortes también aparecerán aquí.</>}
          action={
            <button
              type="button"
              onClick={onFocusComposer}
              className="btn-ink min-h-[44px] px-4 text-xs"
            >
              Escribir primera nota
            </button>
          }
        />
      ) : itemCount === 0 ? (
        <EmptyMessage
          illustration="thread"
          title="Nada coincide con eso."
          body={<>Prueba con otra palabra, otra etiqueta u otro segmento.</>}
          hint={
            hasContentFilter ? (
              <button
                onClick={onClearFilters}
                className="underline hover:text-ink-700 transition-colors"
              >
                Ver todo
              </button>
            ) : undefined
          }
        />
      ) : galleryMode ? (
        <>{gallery}</>
      ) : (
        <>
          {list}
          {isFetchingNextPage && (
            <p className="mt-4 text-center text-xs uppercase tracking-eyebrow text-ink-300">
              <InlineLoadingLabel text="cargando más" />
            </p>
          )}
        </>
      )}
    </>
  )
}
