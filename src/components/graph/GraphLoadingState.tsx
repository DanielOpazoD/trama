/**
 * ω-carga: pantalla de espera del grafo mientras las queries traen las
 * entidades. Antes acá se veía un flash del EmptyState («no hay entidades»)
 * porque la lista llega vacía un instante; esto lo reemplaza por una
 * constelación fantasma que late y el mismo «tejiendo el grafo…» del layout,
 * para que la aparición del mapa sea suave y no un salto desde el vacío.
 *
 * Ornamental (aria en el contenedor, `role="status"`). El pulso respeta
 * `prefers-reduced-motion` vía `animate-pulse-subtle`.
 */
export function GraphLoadingState() {
  return (
    <div
      role="status"
      aria-label="Tejiendo el grafo"
      className="absolute inset-0 flex flex-col items-center justify-center gap-4"
    >
      <svg
        width="132"
        height="96"
        viewBox="0 0 132 96"
        aria-hidden
        className="opacity-80"
      >
        {/* Aristas fantasma — el hilo antes de que aparezcan las cuentas. */}
        <g stroke="var(--ink-2)" strokeWidth="1" opacity="0.28">
          <path d="M34 32 L66 58" />
          <path d="M66 58 L104 34" />
          <path d="M66 58 L58 84" />
        </g>
        {/* Nodos fantasma con pulso escalonado (fases distintas = el grafo
            respira antes de existir). */}
        <circle
          cx="34"
          cy="32"
          r="7"
          fill="var(--type-default)"
          opacity="0.4"
          className="animate-pulse-subtle"
        />
        <circle
          cx="66"
          cy="58"
          r="9"
          fill="var(--accent-gold)"
          opacity="0.5"
          className="animate-pulse-subtle"
          style={{ animationDelay: '0.35s' }}
        />
        <circle
          cx="104"
          cy="34"
          r="7"
          fill="var(--type-default)"
          opacity="0.4"
          className="animate-pulse-subtle"
          style={{ animationDelay: '0.7s' }}
        />
        <circle
          cx="58"
          cy="84"
          r="6"
          fill="var(--type-default)"
          opacity="0.35"
          className="animate-pulse-subtle"
          style={{ animationDelay: '1.05s' }}
        />
      </svg>
      <span className="text-caption font-serif italic text-ink-400">
        tejiendo el grafo…
      </span>
    </div>
  )
}
