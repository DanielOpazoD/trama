/**
 * Comilla ornamental de apertura — el sello editorial de una cita en el mundo
 * Trama: una comilla grande en oro (el acento de la sección Citas) que abre el
 * texto como un epígrafe impreso, sin embeberse en el texto leíble. Compartida
 * para que todas las citas (la vista Citas, la Cronología…) hablen el mismo
 * idioma en vez de mezclar guillemets con el tratamiento editorial.
 *
 * `size`: `lg` para la cita protagonista (vista Citas), `md` para citas dentro
 * de un ítem de lista/timeline. `className` posiciona (normalmente absolute).
 */
export function QuoteMark({
  size = 'lg',
  className = '',
}: {
  size?: 'lg' | 'md'
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none select-none font-serif not-italic leading-none text-[color:var(--accent-gold)] ${className}`}
      style={{ fontSize: size === 'lg' ? '2.6rem' : '1.7rem', opacity: 0.22 }}
    >
      &ldquo;
    </span>
  )
}
