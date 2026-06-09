import type { ReactNode } from 'react'

/**
 * Estado de ERROR de carga, hermano de {@link EmptyMessage}.
 *
 * Un fetch fallido NO es lo mismo que "no hay nada todavía": antes varias vistas
 * destructuraban solo `{ data, isLoading }` y, si la query fallaba, caían al
 * empty state. El usuario veía "aún no hay nada" cuando en realidad algo se
 * rompió — y en las vistas con IA (Atlas, Crónicas) eso podía gatillar una
 * regeneración cara creyendo que el contenido estaba vacío.
 *
 * Mantiene la estética calma del producto (sin caja roja que grite), pero lo
 * nombra como error y ofrece reintentar. `role="alert"` para que los lectores
 * de pantalla lo anuncien.
 */
export function ErrorState({
  title = 'No se pudo cargar',
  body,
  onRetry,
  retrying = false,
}: {
  title?: string
  body?: ReactNode
  onRetry?: () => void
  retrying?: boolean
}) {
  return (
    <div
      role="alert"
      className="mt-8 px-8 py-10 border border-dashed border-ink-200/70 rounded-xl bg-paper-50/30 max-w-xl mx-auto text-center animate-fade-up"
    >
      <h3 className="font-serif text-2xl text-ink-600 italic leading-tight">{title}</h3>
      <p className="mt-3 text-sm text-ink-400 leading-relaxed">
        {body ?? 'Hubo un problema al traer esta información. Puede ser temporal.'}
      </p>
      {onRetry && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="text-xs uppercase tracking-eyebrow text-ink-500 hover:text-ink-700 transition-colors py-2 px-4 border-b border-ink-200 hover:border-ink-500 disabled:text-ink-200 disabled:border-ink-100"
          >
            {retrying ? 'reintentando…' : 'reintentar'}
          </button>
        </div>
      )}
    </div>
  )
}
