import { Spinner } from './Spinner'

export function InlineLoadingLabel({
  text,
  status = false,
  tone = 'default',
  className = '',
}: {
  text: string
  status?: boolean
  tone?: 'default' | 'inverse'
  className?: string
}) {
  const label = text.toLowerCase()
  const a11yProps = status
    ? { role: 'status' as const, 'aria-live': 'polite' as const, 'aria-label': label }
    : {}

  return (
    <span {...a11yProps} className={`inline-loading-label ${className}`.trim()}>
      <Spinner size={13} tone={tone} decorative />
      <span>{label}…</span>
    </span>
  )
}
