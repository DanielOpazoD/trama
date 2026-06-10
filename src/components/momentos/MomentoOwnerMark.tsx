import type { Momento } from '../../types'
import { personInitial, personLabel, shareRoleLabel } from './sharePresentation'

export function MomentoOwnerMark({ momento }: { momento: Momento }) {
  const isOwn = momento.accessRole === 'owner'
  if (!momento.shared && !isOwn) return null
  const label = isOwn
    ? 'Tú'
    : personLabel({
        displayName: momento.ownerDisplayName,
        email: momento.ownerEmail,
      })
  const ariaLabel = isOwn ? 'ti' : label
  const role = shareRoleLabel(momento.accessRole)
  return (
    <span
      className="mt-2 inline-flex items-center gap-2 rounded-full border border-ink-100/70 bg-paper-100/55 py-1 pl-1 pr-2.5 text-caption text-ink-500"
      aria-label={`Subido por ${ariaLabel}`}
      title={`Subido por ${ariaLabel}`}
    >
      <span
        className="grid size-5 place-items-center rounded-full text-micro font-medium text-paper-50"
        style={{ backgroundColor: 'var(--accent-gold)' }}
        aria-hidden
      >
        {personInitial(label)}
      </span>
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-ink-400">Subido por</span>
        <span className="font-medium text-ink-700">{label}</span>
        <span className="text-ink-300">·</span>
        <span className="text-ink-400">{role}</span>
      </span>
    </span>
  )
}
