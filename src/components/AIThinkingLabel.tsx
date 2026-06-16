import { Spinner } from './Spinner'

type AIThinkingState =
  | 'thinking'
  | 'reading'
  | 'weaving'
  | 'synthesizing'
  | 'proposing'
  | 'reviewing'

const AI_STATE_COPY: Record<AIThinkingState, string> = {
  thinking: 'pensando',
  reading: 'leyendo',
  weaving: 'hilando',
  synthesizing: 'sintetizando',
  proposing: 'proponiendo',
  reviewing: 'revisando',
}

export function AIThinkingLabel({
  state = 'thinking',
  text,
  tone = 'default',
}: {
  state?: AIThinkingState
  text?: string
  tone?: 'default' | 'inverse'
}) {
  const label = (text ?? AI_STATE_COPY[state]).toLowerCase()

  return (
    <span className="ai-thinking-label" data-ai-state={state}>
      <Spinner size={13} variant="ai" tone={tone} decorative />
      <span>{label}…</span>
    </span>
  )
}
