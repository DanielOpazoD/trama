/**
 * Small icon set, drawn inline (no icon library dependency).
 *
 * Stroke-width system — coherencia óptica:
 *   - 1.6  ui            (la "house weight", todos los UI icons usan esta)
 *   - 1.4  accent        (SparkleIcon — las 8 rayitas se ven amontonadas
 *                         con 1.6, baja a 1.4 para que respiren)
 *   - 1.7  brand-primary (TramaMark T principal — logo, intencional ancho)
 *   - 1.1  brand-detail  (TramaMark threads — sub-ornament del logo)
 *   - 1.0  ornament      (EndMark diamond — flourish discreto)
 *   - 0.8–0.9 ornament-thread (OrnamentBreak threads — flujo editorial)
 *
 * Si vas a añadir un icon UI nuevo, no inventes un grosor: usá `base`
 * (1.6). Solo desvías cuando hay una razón clara (densidad alta, o el
 * icon es decorativo no informativo).
 */

type Props = { size?: number; className?: string }

const base = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const ChevronLeftIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

export const ChevronRightIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M9 18l6-6-6-6" />
  </svg>
)

export const CloseIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
)

export const SearchIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)

export const ArrowRightIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
)

export const SparkleIcon = ({ size = 12, className }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    {...base}
    strokeWidth={1.4}
  >
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
  </svg>
)

export const SunIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
)

export const MoonIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

export const DownloadIcon = ({ size = 12, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
)

export const UploadIcon = ({ size = 12, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
)

export const TrashIcon = ({ size = 12, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </svg>
)

/* Network of 4 connected nodes — Grafo */
export const GraphIcon = ({ size = 16, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M7 7l5 5M12 12l5-5M12 12v6" strokeOpacity={0.65} />
    <circle cx="7" cy="7" r="2.2" fill="currentColor" fillOpacity={0.18} />
    <circle cx="17" cy="7" r="2.2" fill="currentColor" fillOpacity={0.18} />
    <circle cx="12" cy="12" r="2.4" fill="currentColor" fillOpacity={0.32} />
    <circle cx="12" cy="19" r="2.2" fill="currentColor" fillOpacity={0.18} />
  </svg>
)

/* Three rows of dot + line — Entidades */
export const EntitiesIcon = ({ size = 16, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <circle cx="5" cy="6.5" r="1.5" fill="currentColor" />
    <circle cx="5" cy="12" r="1.5" fill="currentColor" />
    <circle cx="5" cy="17.5" r="1.5" fill="currentColor" />
    <path d="M10 6.5h10M10 12h10M10 17.5h7" strokeOpacity={0.7} />
  </svg>
)

/* Double opening-quote mark — Citas */
export const QuoteIcon = ({ size = 16, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none">
    <path
      d="M7 7c-1.5 0-3 1-3 3v4h5v-5H7c0-1 1-2 2-2V7zM17 7c-1.5 0-3 1-3 3v4h5v-5h-2c0-1 1-2 2-2V7z"
      fill="currentColor"
      fillOpacity={0.85}
    />
  </svg>
)

/* Two interlocked chain links — Relaciones */
export const RelationsIcon = ({ size = 16, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M9 13.5a4 4 0 0 1 0-5.5L11 6a4 4 0 0 1 5.5 5.5l-1 1" />
    <path d="M15 10.5a4 4 0 0 1 0 5.5L13 18a4 4 0 0 1-5.5-5.5l1-1" />
  </svg>
)

/* Conversation bubble for the Chat tab */
export const ChatIcon = ({ size = 16, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
)

/* Simple house outline for the Inicio tab */
export const HomeIcon = ({ size = 16, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M3 10.5 12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20Z" />
    <path d="M9 21v-7h6v7" />
  </svg>
)

/* Musical note for the Escuchas tab */
export const MusicIcon = ({ size = 16, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" fill="currentColor" fillOpacity={0.18} />
    <circle cx="18" cy="16" r="3" fill="currentColor" fillOpacity={0.18} />
  </svg>
)

/* ξ — Momentos: reloj de arena estilizado / clepsidra editorial. La idea
   es "tiempo que se acumula", no "tiempo que pasa de un lado al otro".
   Dos triángulos espejados con un punto central que es el ahora. */
export const MomentosIcon = ({ size = 16, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M7 4h10M7 20h10" />
    <path d="M7 4c0 4 5 6 5 8s-5 4-5 8" />
    <path d="M17 4c0 4-5 6-5 8s5 4 5 8" />
    <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
  </svg>
)

/* Cronología — un riel temporal: la línea vertical del tiempo con tres
   nodos (estaciones que se suceden) y sus entradas a la derecha. Lee como
   "hojear el tiempo": estratos que bajan por la página. */
export const CronologiaIcon = ({ size = 16, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M7 4v16" />
    <circle cx="7" cy="7" r="1.4" />
    <circle cx="7" cy="12" r="1.4" />
    <circle cx="7" cy="17" r="1.4" />
    <path d="M11 7h8M11 12h6M11 17h8" />
  </svg>
)

/* Atlas — constelación: nodos dispersos unidos por líneas finas, un mapa
   de cercanías semánticas. Lee como "el cielo de tu trama": grupos que se
   reconocen por su figura, no por su posición exacta. */
export const AtlasIcon = ({ size = 16, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M5 8l6 3 4-5M11 11l5 6M11 11l-4 6" />
    <circle cx="5" cy="8" r="1.3" />
    <circle cx="15" cy="6" r="1.3" />
    <circle cx="11" cy="11" r="1.3" />
    <circle cx="16" cy="17" r="1.3" />
    <circle cx="7" cy="17" r="1.3" />
  </svg>
)

/* Info — círculo con "i" delicado. Tamaño default 12 (chip-friendly). */
export const InfoIcon = ({ size = 12, className }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    {...base}
    strokeWidth={1.4}
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" />
  </svg>
)

/* Gear / settings */
export const SettingsIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

/* Trama monogram — a woven "T" with crossed threads beneath.
   La identidad visual de la marca: una "T" geométrica con dos hilos
   cruzados que pasan por el stem vertical. Lee como "T" desde lejos
   (typográfico) y como "telar" de cerca (semántico). El cross-point
   de los hilos cae exactamente en el stem — no es coincidencia.

   `animate`: cuando true, agrega las clases CSS que dibujan los
   strokes con dash-offset (mark-crossbar/mark-vertical/mark-thread).
   Solo activarlo en el Splash — en sidebar/lockup no queremos que
   anime cada vez que el componente monta. */
export const TramaMark = ({
  size = 22,
  className,
  animate,
}: Props & { animate?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none">
    <path
      className={animate ? 'mark-crossbar' : undefined}
      d="M5 6h14"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
    />
    <path
      className={animate ? 'mark-vertical' : undefined}
      d="M12 6v13"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
    />
    <path
      className={animate ? 'mark-thread' : undefined}
      d="M9 11l6 4M15 11l-6 4"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeOpacity={0.55}
      strokeLinecap="round"
    />
  </svg>
)

/* Brand lockup — TramaMark + wordmark "Trama" lado a lado.
   La presentación canónica de la marca cuando hay espacio para
   ambos. Usa el mismo gap-2 que el Sidebar para mantener feel
   consistente. El wordmark hereda el font-family `wordmark`
   (Spectral) declarado en index.css.

   El gap, peso y leading son fijos — esto es la firma de la marca,
   no un componente con muchas variantes. Si necesitás otra
   composición, manualmente. */
export const TramaLockup = ({
  size = 22,
  className,
  animate,
  wordmarkClassName,
}: Props & { animate?: boolean; wordmarkClassName?: string }) => (
  <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
    <TramaMark size={size} animate={animate} className="shrink-0" />
    <span
      className={`wordmark leading-none ${wordmarkClassName ?? 'text-lg text-ink-800'}`}
    >
      Trama
    </span>
  </span>
)

/* Editorial ornament — a printer's flourish that picks up the woven-thread
   motif from TramaMark. Used as a section break between long blocks
   (Featured Quote / Timeline / Threads). Wider than tall on purpose: it
   sits like a rule across the column. */
export const OrnamentBreak = ({ size = 72, className }: Props) => (
  <svg
    width={size}
    height={(size * 12) / 72}
    viewBox="0 0 72 12"
    className={className}
    fill="none"
    aria-hidden="true"
  >
    {/* central diamond — the knot of the weave */}
    <path
      d="M36 2l3 4-3 4-3-4z"
      stroke="currentColor"
      strokeWidth={0.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeOpacity={0.7}
    />
    {/* threads radiating outward, fading to nothing */}
    <path
      d="M30 6h-10M42 6h10"
      stroke="currentColor"
      strokeWidth={0.8}
      strokeLinecap="round"
      strokeOpacity={0.45}
    />
    {/* terminal dots */}
    <circle cx="19" cy="6" r="0.9" fill="currentColor" fillOpacity={0.5} />
    <circle cx="53" cy="6" r="0.9" fill="currentColor" fillOpacity={0.5} />
  </svg>
)

/* Empty-state illustration — "hilos que aún no se tejen". Dos trazos
   que casi se cruzan pero no llegan a entretejerse, evocando el
   concepto "trama" en estado potencial. Diseño minimalista que
   complementa la composición editorial del EmptyMessage sin gritar.

   Tres tamaños semánticos:
     - 'thread'   un solo trazo con punto al final (sin algo, ej. citas)
     - 'pair'     dos trazos paralelos que no se cruzan (sin relación)
     - 'weave'    los dos trazos curvos con punto central (sin entidades) */
type IllustrationKind = 'thread' | 'pair' | 'weave'

export const EmptyIllustration = ({
  kind = 'weave',
  size = 96,
  className,
}: {
  kind?: IllustrationKind
  size?: number
  className?: string
}) => {
  if (kind === 'thread') {
    return (
      <svg
        width={size}
        height={(size * 24) / 96}
        viewBox="0 0 96 24"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <path
          d="M8 12h70"
          stroke="currentColor"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeOpacity={0.45}
          strokeDasharray="1 5"
        />
        <circle cx="82" cy="12" r="1.4" fill="currentColor" fillOpacity={0.6} />
      </svg>
    )
  }
  if (kind === 'pair') {
    return (
      <svg
        width={size}
        height={(size * 36) / 96}
        viewBox="0 0 96 36"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <circle cx="14" cy="10" r="2.2" fill="currentColor" fillOpacity={0.5} />
        <circle cx="14" cy="26" r="2.2" fill="currentColor" fillOpacity={0.5} />
        <path
          d="M22 10h60M22 26h60"
          stroke="currentColor"
          strokeWidth={1}
          strokeOpacity={0.35}
          strokeDasharray="1 4"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  // weave (default)
  return (
    <svg
      width={size}
      height={(size * 48) / 96}
      viewBox="0 0 96 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Dos curvas que se cruzan en el centro — el "weave" sugerido */}
      <path
        d="M8 12 C 28 12, 36 36, 56 36 S 84 36, 88 36"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeOpacity={0.45}
        fill="none"
      />
      <path
        d="M8 36 C 28 36, 36 12, 56 12 S 84 12, 88 12"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeOpacity={0.45}
        fill="none"
      />
      {/* Nodo central — el punto de encuentro */}
      <circle cx="48" cy="24" r="1.8" fill="currentColor" fillOpacity={0.7} />
    </svg>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   Icons añadidos en EE-brand (P3-#19): extraer SVGs inline que vivían
   dispersos en AskBar/ChatView/ProposalPanel. Cada uno usaba un stroke
   distinto (1.8 vs 1.6 vs 3); al unificarlos bajo `base` (1.6) el
   sistema queda sin desviaciones no documentadas.
   ───────────────────────────────────────────────────────────────────── */

/** Cámara — usado por AskBar para "subir una foto". Antes vivía inline
    duplicado; ahora canónico con stroke 1.6. */
export const CameraIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
)

/** Líneas de lectura (4 líneas horizontales decrecientes) — botón "modo
    lectura" de AskBar. Metáfora visual de "texto largo, párrafos". */
export const ReadingIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M4 5h16M4 9h16M4 13h10M4 17h12" />
  </svg>
)

/** Gabinete — una cómoda de dos cajones con tiradores. Glyph del índice de
    los gestos literarios (Sortes, Espejo, Voz, Hojas, Postales). */
export const GabineteIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <rect x="4" y="3" width="16" height="18" rx="1.5" />
    <path d="M4 12h16M10 7.5h4M10 16.5h4" />
  </svg>
)

/** Checkmark — usado en chips pequeños "verificado por X" en ProposalPanel.
    Stroke 2.2 (override automático para size <= 12) porque a 10px el 1.6
    desaparece. A size >= 14 vuelve a 1.6 — el sistema sigue. */
export const CheckIcon = ({
  size = 10,
  className,
  strokeOverride,
}: Props & { strokeOverride?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeOverride ?? (size <= 12 ? 2.2 : 1.6)}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M5 13l4 4L19 7" />
  </svg>
)

/* End-of-content mark — a single woven dot, used like ❦ to close a long
   section or a featured quote. Smaller and quieter than OrnamentBreak. */
export const EndMark = ({ size = 14, className }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M12 5l4 7-4 7-4-7z"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeOpacity={0.65}
    />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" fillOpacity={0.45} />
  </svg>
)
