/**
 * Skeleton primitives. Reemplazan al "cargando…" italic con un placeholder
 * visual que esboza la estructura del contenido que va a llegar.
 *
 * Sustituye texto loading por shimmer:
 *   - El skeleton tiene la silueta del contenido final (avatar + 2 líneas)
 *   - Un linear-gradient se desplaza horizontalmente: feel "está cargando"
 *   - El usuario percibe progreso (vs un spinner girando sobre vacío)
 *
 * Tres componentes:
 *   - <Skeleton /> bloque genérico (configurable con className)
 *   - <EntityCardSkeleton /> esqueleto de una card en EntitiesView
 *   - <QuoteSkeleton /> esqueleto de una cita en QuotesView/Home
 *   - <TimelineRowSkeleton /> esqueleto de un evento en HomeView
 *   - <ThreadRowSkeleton /> esqueleto de un hilo en ChatView rail
 */

type SkeletonProps = {
  className?: string
  /** Si true, aplica shimmer; si false, solo el color base. */
  shimmer?: boolean
}

export function Skeleton({ className = '', shimmer = true }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={`skeleton-line ${shimmer ? 'skeleton-shimmer' : 'skeleton-static'} ${className}`}
    />
  )
}

/**
 * Card en lista de Entidades. Hereda el padding y border de la fila real
 * para que el cambio de skeleton → real sea imperceptible en layout.
 */
export function EntityCardSkeleton({ animationDelay = 0 }: { animationDelay?: number }) {
  return (
    <div
      className="p-4 skeleton-surface animate-fade-up"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
        </div>
        <Skeleton className="h-3 w-16 shrink-0" />
      </div>
    </div>
  )
}

/**
 * Cita en lista de Citas o Home featured. La línea serif larga + atribución
 * abajo replican la composición real.
 */
export function QuoteSkeleton({ animationDelay = 0 }: { animationDelay?: number }) {
  return (
    <div
      className="border-l-2 border-ink-200/40 pl-4 py-1 space-y-2 animate-fade-up"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-2.5 w-1/3 mt-1.5" />
    </div>
  )
}

/**
 * Evento en el timeline de Inicio. Layout horizontal con eyebrow + nombre + fecha.
 */
export function TimelineRowSkeleton({ animationDelay = 0 }: { animationDelay?: number }) {
  return (
    <div
      className="p-3 skeleton-surface animate-fade-up"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0 flex-1">
          <Skeleton className="h-2.5 w-14 shrink-0" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-2.5 w-10 shrink-0" />
      </div>
    </div>
  )
}

/**
 * Hilo en el rail izquierdo del Chat. Título + meta debajo.
 */
export function ThreadRowSkeleton({ animationDelay = 0 }: { animationDelay?: number }) {
  return (
    <div
      className="px-4 py-3 border-l-2 border-transparent animate-fade-up"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <Skeleton className="h-3 w-3/4 mb-1.5" />
      <Skeleton className="h-2.5 w-1/3" />
    </div>
  )
}

/**
 * Entrada del timeline de Momentos. Hour gutter + bloque de texto serif
 * o card visual; este skeleton imita el caso "nota corta" (más común).
 */
export function MomentoSkeleton({ animationDelay = 0 }: { animationDelay?: number }) {
  return (
    <li
      className="relative pl-5 animate-fade-up"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* Hour gutter — silueta de la marca temporal italic. */}
      <div
        className="absolute left-0 top-1 w-12 -ml-1 pr-2 border-r border-ink-100/40"
        aria-hidden
      >
        <Skeleton className="h-2 w-8 ml-auto" />
      </div>
      <div className="ml-12 space-y-2">
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </li>
  )
}

/**
 * Fila de relación en RelationshipsView. Tres bloques: from-name → type
 * → to-name, alineados al baseline. Las relaciones varían en ancho;
 * usamos w-1/4 / w-1/5 / w-1/3 para variedad visual.
 */
export function RelationshipSkeleton({
  animationDelay = 0,
}: {
  animationDelay?: number
}) {
  return (
    <div
      className="skeleton-surface p-3 animate-fade-up"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="flex items-baseline gap-3 text-sm">
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  )
}

/**
 * Sugerencia IA en ProactiveView. Header con eyebrow + título +
 * dos líneas de contexto + 2 botones (descartar / aceptar).
 */
export function ProactiveSuggestionSkeleton({
  animationDelay = 0,
}: {
  animationDelay?: number
}) {
  return (
    <div
      className="skeleton-surface p-4 space-y-3 animate-fade-up"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <div className="flex justify-end gap-2">
        <Skeleton className="h-7 w-16" shimmer={false} />
        <Skeleton className="h-7 w-20" shimmer={false} />
      </div>
    </div>
  )
}

/**
 * Helper para renderizar N skeletons con stagger sutil — cada uno entra
 * 30ms después del anterior, hasta un cap de 240ms para no quedar lento.
 */
export function SkeletonList({
  count,
  Component,
}: {
  count: number
  Component: React.ComponentType<{ animationDelay?: number }>
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Component key={i} animationDelay={Math.min(i * 30, 240)} />
      ))}
    </>
  )
}
