import type { ReactNode } from 'react'
import { EmptyIllustration, SparkleIcon } from './Icons'

/**
 * Designed empty state. The plain "Aún sin citas." pattern that lived in every
 * view feels like a system error message — this component dignifies the
 * emptiness with editorial composition: an optional illustration, a heading
 * in serif, a subtitle in sans-serif, an optional aspirational hint, and
 * optional action(s).
 *
 * Variants:
 *   - 'soft'  → light card on paper, used when the list is paginated or the
 *                view loads with no rows yet (most common case).
 *   - 'plain' → no card, just spaced text. For places already inside a card.
 *
 * Para empty states con illustration usar la prop `illustration` con
 * "weave" (default), "pair" o "thread" — son variaciones del woven motif
 * que da identidad al producto sin gritar.
 */
export function EmptyMessage({
  icon,
  illustration,
  title,
  body,
  hint,
  action,
  variant = 'soft',
}: {
  icon?: ReactNode
  /** Tipo de SVG ilustrado encima del título. Reemplaza al `icon` chico
      cuando se quiere algo más editorial. */
  illustration?: 'weave' | 'pair' | 'thread'
  title: string
  body?: ReactNode
  hint?: ReactNode
  action?: ReactNode
  variant?: 'soft' | 'plain'
}) {
  const wrapper =
    variant === 'soft'
      ? 'mt-8 px-8 py-10 border border-dashed border-ink-100/60 rounded-xl bg-paper-50/30 max-w-xl mx-auto text-center animate-fade-up'
      : 'mt-8 px-2 py-6 max-w-xl mx-auto text-center animate-fade-up'

  return (
    <div className={wrapper}>
      {illustration ? (
        <div className="text-ink-300 flex justify-center mb-5">
          <EmptyIllustration kind={illustration} size={120} />
        </div>
      ) : (
        icon && <div className="text-ink-300 flex justify-center mb-3">{icon}</div>
      )}
      <h3 className="font-serif text-2xl text-ink-600 italic leading-tight">{title}</h3>
      {body && <p className="mt-3 text-sm text-ink-400 leading-relaxed">{body}</p>}
      {hint && <p className="mt-2 text-xs text-ink-300 leading-relaxed italic">{hint}</p>}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  )
}

/** Pre-baked variant with the AI sparkle, for views where the next step is the IA. */
export function EmptyMessageWithSparkle(
  props: Omit<Parameters<typeof EmptyMessage>[0], 'icon'>,
) {
  return <EmptyMessage icon={<SparkleIcon size={18} />} {...props} />
}
