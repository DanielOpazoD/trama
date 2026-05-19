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
