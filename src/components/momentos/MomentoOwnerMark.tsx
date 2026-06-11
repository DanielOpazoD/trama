import type { Momento } from '../../types'
import { useCurrentClientUserProfile } from '../../lib/clientIdentity'
import { personInitial, personLabel, shareRoleLabel } from './sharePresentation'

export function MomentoOwnerMark({ momento }: { momento: Momento }) {
  const currentUser = useCurrentClientUserProfile()
  const isOwn = momento.accessRole === 'owner'
  if (!momento.shared && !isOwn) return null
  const ownerDisplayName =
    momento.ownerDisplayName === 'Trama (legacy)' ? undefined : momento.ownerDisplayName
  const label = personLabel({
    displayName: isOwn ? currentUser.label || ownerDisplayName : ownerDisplayName,
    email: isOwn ? currentUser.email || momento.ownerEmail : momento.ownerEmail,
    fallback: isOwn ? 'propietario' : undefined,
  })
  const role = shareRoleLabel(momento.accessRole)
  return (
    <span
      className="mt-2 inline-flex items-center gap-2 rounded-full border border-ink-100/70 bg-paper-100/55 py-1 pl-1 pr-2.5 text-caption text-ink-500"
      aria-label={`Subido por ${label}`}
      title={`Subido por ${label}`}
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
