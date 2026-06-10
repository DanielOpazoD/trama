import type { MomentoShareInvitation } from '../../api/momentos'
import { ShareIcon } from '../Icons'
import { personInitial, personLabel, shareRoleLabel } from './sharePresentation'

export function MomentoShareInvitationCard({
  invitation,
  pending,
  onRespond,
}: {
  invitation: MomentoShareInvitation
  pending: boolean
  onRespond: (id: string, action: 'accept' | 'reject') => void
}) {
  const inviter = personLabel({
    displayName: invitation.inviterDisplayName,
    email: invitation.inviterEmail,
    fallback: 'Alguien',
  })
  return (
    <div className="rounded-lg border border-ink-100 bg-paper-50 px-3 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full text-sm font-medium text-paper-50"
          style={{ backgroundColor: 'var(--accent-gold)' }}
          aria-hidden
        >
          {personInitial(inviter)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-micro uppercase tracking-eyebrow text-ink-400">
            <ShareIcon size={11} />
            espacio de Momentos
          </div>
          <p className="mt-1 text-sm text-ink-700">
            {inviter} compartió sus Momentos contigo
          </p>
          <p className="mt-0.5 text-caption text-ink-400">
            {shareRoleLabel(invitation.role)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => onRespond(invitation.id, 'reject')}
          className="rounded-md border border-ink-100 px-2.5 py-1.5 text-sm text-ink-500 transition-colors hover:border-ink-200 hover:text-ink-700 disabled:opacity-50"
          aria-label={`Rechazar invitación de ${inviter}`}
        >
          Rechazar
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onRespond(invitation.id, 'accept')}
          className="rounded-md bg-ink-900 px-2.5 py-1.5 text-sm text-paper-50 transition-opacity disabled:opacity-50"
          aria-label={`Aceptar invitación de ${inviter}`}
        >
          Aceptar
        </button>
      </div>
    </div>
  )
}
