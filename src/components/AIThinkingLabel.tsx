import { Spinner } from './Spinner'

export function AIThinkingLabel({
  text = 'pensando',
  tone = 'default',
}: {
  text?: string
  tone?: 'default' | 'inverse'
}) {
  return (
    <span className="ai-thinking-label">
      <Spinner size={13} variant="ai" tone={tone} decorative />
      <span>{text.toLowerCase()}…</span>
    </span>
  )
}
