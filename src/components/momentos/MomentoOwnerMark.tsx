import type { Momento } from '../../types'
import { UserIcon } from '../Icons'

export function MomentoOwnerMark({ momento }: { momento: Momento }) {
  if (!momento.shared) return null
  const label = momento.ownerDisplayName || momento.ownerEmail || 'otro usuario'
  return (
    <span
      className="mt-2 inline-flex items-center gap-1 text-micro uppercase tracking-eyebrow text-ink-400"
      aria-label={`Subido por ${label}`}
      title={`Subido por ${label}`}
    >
      <UserIcon size={10} />
      <span>{label}</span>
    </span>
  )
}
