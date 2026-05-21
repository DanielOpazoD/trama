/**
 * Small icon set, drawn inline so we don't ship an icon library dependency.
 * 1.6px stroke is the house weight; sizes default to 14px.
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
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base} strokeWidth={2}>
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
)

export const SparkleIcon = ({ size = 12, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base} strokeWidth={1.4}>
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

/* Trama monogram — a woven "T" for the collapsed sidebar */
export const TramaMark = ({ size = 22, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none">
    <path d="M5 6h14" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
    <path d="M12 6v13" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
    <path
      d="M9 11l6 4M15 11l-6 4"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeOpacity={0.55}
      strokeLinecap="round"
    />
  </svg>
)
