import type { CSSProperties } from 'react'

type SpinnerVariant = 'data' | 'ai'
type SpinnerTone = 'default' | 'inverse'

export function Spinner({
  size = 16,
  variant = 'data',
  tone = 'default',
  label = 'cargando',
  decorative = false,
  active = true,
  className = '',
}: {
  size?: number
  variant?: SpinnerVariant
  tone?: SpinnerTone
  label?: string
  decorative?: boolean
  active?: boolean
  className?: string
}) {
  const a11yProps = decorative
    ? { 'aria-hidden': true }
    : { role: 'status' as const, 'aria-label': label }

  return (
    <span
      {...a11yProps}
      data-testid="trama-spinner"
      className={`trama-spinner trama-spinner--${variant} trama-spinner--${tone} ${
        active ? '' : 'trama-spinner--idle'
      } ${className}`.trim()}
      style={
        {
          '--trama-spinner-size': `${size}px`,
        } as CSSProperties
      }
    >
      <span className="trama-spinner__ring" />
      <span className="trama-spinner__thread" />
      <span className="trama-spinner__core" />
      <span className="trama-spinner__spark trama-spinner__spark--one" />
      <span className="trama-spinner__spark trama-spinner__spark--two" />
    </span>
  )
}
