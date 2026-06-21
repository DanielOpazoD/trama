import { Skeleton } from '../Skeleton'

/**
 * Esqueleto de la cuadrícula de la Biblioteca: cards fantasma con la silueta de
 * una FileCard real (barra del nombre + bloque de media + barra de metadata).
 * Misma grilla responsiva que la vista real y el mismo stagger sutil (30ms,
 * cap 240ms) que BibliotecaListSkeleton.
 */
export function BibliotecaGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div aria-hidden className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="card-paper flex flex-col gap-2.5 p-3 animate-fade-up"
          style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}
        >
          {/* Nombre */}
          <Skeleton className={`h-3.5 ${i % 3 === 0 ? 'w-1/2' : 'w-2/3'}`} />
          {/* Media */}
          <Skeleton className="h-28 w-full rounded-lg" />
          {/* Metadata */}
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  )
}
