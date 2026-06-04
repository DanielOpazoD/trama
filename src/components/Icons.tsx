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
 * Si vas a añadir un icon UI nuevo, no inventes un grosor: usa `base`
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

/* Lápiz inclinado — acción "editar" (reemplaza los textos "editar" sueltos). */
export const PencilIcon = ({ size = 12, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
)

/* Cruz fina — acción "añadir". */
export const PlusIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

/* Chincheta — fijar/soltar una nota. */
export const PinIcon = ({ size = 13, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M9 3h6l-1 5 3 3v2H7v-2l3-3-1-5zM12 15v6" />
  </svg>
)

/* Marco de recorte — editor de imágenes. */
export const CropIcon = ({ size = 12, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M6 2v16a1 1 0 0 0 1 1h15" />
    <path d="M2 6h16a1 1 0 0 1 1 1v15" />
  </svg>
)

/* Flecha en ángulo recto — rotar 90°. */
export const RotateIcon = ({ size = 12, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M3 9a9 9 0 0 1 15-3l3 3" />
    <path d="M21 4v5h-5" />
    <rect x="3" y="13" width="9" height="8" rx="1" />
  </svg>
)

/* Flecha curva hacia atrás — deshacer. */
export const UndoIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M9 5 4 10l5 5" />
    <path d="M4 10h10a6 6 0 0 1 0 12H9" />
  </svg>
)

/* Flecha curva hacia adelante — rehacer. */
export const RedoIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M15 5 20 10l-5 5" />
    <path d="M20 10H10a6 6 0 0 0 0 12h5" />
  </svg>
)

/* Dos rectángulos — duplicar. */
export const DuplicateIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
)

/* Impresora — imprimir página(s) del PDF. */
export const PrinterIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M6 9V3h12v6" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="7" rx="1" />
  </svg>
)

/* Doble "A" — tamaño de letra. */
export const TextSizeIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M2 18 L7 6 L12 18 M3.7 14 H10.3" />
    <path d="M14 18 L17 10 L20 18 M15.2 15 H18.8" />
  </svg>
)

/* Círculo medio lleno — opacidad/transparencia. */
export const OpacityIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4 A8 8 0 0 1 12 20 Z" fill="currentColor" stroke="none" />
  </svg>
)

/* Lupa con + — zoom del documento. */
export const ZoomIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20 L16 16 M11 8 V14 M8 11 H14" />
  </svg>
)

/* "T" de texto — agregar texto en el editor. */
export const TextIcon = ({ size = 12, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M5 5h14M12 5v14M9 19h6" />
  </svg>
)

/* "B" de negrita. */
export const BoldIcon = ({ size = 12, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
  </svg>
)

/* Flecha circular — acción "regenerar / actualizar". */
export const RefreshIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 4v5h-5" />
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

/* X (Twitter): el glifo "X" actual de la marca — dos trazos cruzados.
   Lo dibujamos a mano (sin dependencia de icon lib) con la house weight. */
/** X (Twitter) — logo oficial. Glyph relleno; hereda currentColor para
    integrarse con la tinta del sistema (variante monocroma oficial). */
export const TwitterIcon = ({ size = 16, className }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    aria-hidden
  >
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </svg>
)

/** Spotify — logo oficial (variante monocroma; hereda currentColor). */
export const SpotifyIcon = ({ size = 16, className }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    aria-hidden
  >
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
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

/** Documento con marca "PDF" implícita (hoja con esquina doblada + renglones). */
export const FilePdfIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h6" />
  </svg>
)

/** Líneas de lectura (4 líneas horizontales decrecientes) — botón "modo
    lectura" de AskBar. Metáfora visual de "texto largo, párrafos". */
export const ReadingIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M4 5h16M4 9h16M4 13h10M4 17h12" />
  </svg>
)

/** Notes — hoja con esquina doblada y renglones. Mundo / sección Trama Notas. */
export const NotesIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v4h4M9 12.5h6M9 16h4" />
  </svg>
)

/** Tasks — checklist (dos ítems con tilde). Sección Tareas de Trama Notas. */
export const TasksIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M4 7l1.6 1.6L8.5 5.5M12 7.5h8M4 16l1.6 1.6L8.5 14M12 16.5h8" />
  </svg>
)

/** Prompt — bloque de texto/código con cursor. */
export const PromptIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M8 9l3 3-3 3M13 15h3" />
  </svg>
)

/** Key — sección Claves / secretos. */
export const KeyIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <circle cx="7.5" cy="12.5" r="3.5" />
    <path d="M11 12.5h9M16 12.5v3M19 12.5v2" />
  </svg>
)

/** Archivo adjunto genérico. */
export const FileIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v4h4" />
  </svg>
)

/** Escudo — señales de seguridad/confianza. */
export const ShieldIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M12 3l7 3v5c0 4.5-2.8 8.4-7 10-4.2-1.6-7-5.5-7-10V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
)

/** Chevron hacia abajo — disclosure del conmutador de mundos. */
export const ChevronDownIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)

/** Portapapeles — para el botón "copiar prompt de importación" de Citas. */
export const ClipboardIcon = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4V3a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 3v1z" />
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
