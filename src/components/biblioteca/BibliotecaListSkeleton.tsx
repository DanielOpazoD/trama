import { Skeleton } from '../Skeleton'

/**
 * Esqueleto de la lista de la Biblioteca: ~8 filas con la silueta de una fila
 * real (cuadradito del ícono + barra larga del nombre + barras cortas de
 * fecha y tamaño). Usa el shimmer del repo; nada de spinners grandes. El
 * stagger sutil (30ms, cap 240ms) sigue el patrón de SkeletonList.
 */
export function BibliotecaListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-hidden className="mt-1">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 h-14 px-2 border-b border-ink-100/40 animate-fade-up"
          style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}
        >
          {/* Ícono de tipo */}
          <Skeleton className="h-5 w-5 rounded-md shrink-0" />
          {/* Nombre — barra larga, ancho variable para naturalidad */}
          <Skeleton className={`h-3.5 ${i % 3 === 0 ? 'w-1/2' : 'w-2/3'}`} />
          <span className="flex-1" />
          {/* Modificado */}
          <Skeleton className="h-3 w-12 shrink-0" />
          {/* Tamaño (oculto en móvil, como la columna real) */}
          <Skeleton className="h-3 w-14 shrink-0 hidden sm:block" />
        </div>
      ))}
    </div>
  )
}
