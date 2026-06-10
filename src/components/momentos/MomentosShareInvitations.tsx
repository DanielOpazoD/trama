import type { MomentoShareInvitation } from '../../api/momentos'
import { ShareIcon } from '../Icons'

export function MomentosShareInvitations({
  items,
  pending,
  onRespond,
}: {
  items: MomentoShareInvitation[]
  pending: boolean
  onRespond: (id: string, action: 'accept' | 'reject') => void
}) {
  if (items.length === 0) return null
  return (
    <div className="mb-5 space-y-2" aria-label="Invitaciones de momentos">
      {items.map((item) => {
        const inviter = item.inviterDisplayName || item.inviterEmail || 'Alguien'
        return (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-100 bg-paper-100/60 px-3 py-2"
          >
            <div className="flex min-w-0 items-start gap-2">
              <span className="mt-0.5 text-ink-400" aria-hidden>
                <ShareIcon size={13} />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-ink-700">
                  {inviter} compartió sus Momentos contigo
                </p>
                <p className="text-caption text-ink-400">
                  {item.role === 'editor' ? 'puedes editar' : 'solo lectura'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => onRespond(item.id, 'reject')}
                className="rounded-md border border-ink-100 px-2.5 py-1.5 text-sm text-ink-500 hover:text-ink-700 disabled:opacity-50"
              >
                Rechazar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onRespond(item.id, 'accept')}
                className="rounded-md bg-ink-900 px-2.5 py-1.5 text-sm text-paper-50 disabled:opacity-50"
              >
                Aceptar
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
