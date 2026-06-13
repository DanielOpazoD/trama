import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { MomentoShareInvitation } from '../../api/momentos'
import { BellIcon } from '../Icons'
import { MomentoShareInvitationCard } from './MomentoShareInvitationCard'

export function MomentoNotificationsCenter({
  invitations,
  pending,
  onRespond,
}: {
  invitations: MomentoShareInvitation[]
  pending: boolean
  onRespond: (id: string, action: 'accept' | 'reject') => void
}) {
  const [open, setOpen] = useState(false)
  const count = invitations.length
  const panel =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div data-testid="momento-notifications-layer" className="fixed inset-0 z-[80]">
            <button
              type="button"
              aria-label="Cerrar centro de notificaciones"
              onClick={() => setOpen(false)}
              className="absolute inset-0 cursor-default bg-ink-900/10 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-0"
            />
            <div
              role="dialog"
              aria-label="Centro de notificaciones"
              className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top)+7.25rem)] z-[81] max-h-[min(68vh,34rem)] overflow-y-auto rounded-lg border border-ink-100 bg-paper-50 p-3 shadow-xl shadow-ink-900/25 sm:left-auto sm:right-4 sm:top-14 sm:w-[min(360px,calc(100vw-2rem))] sm:max-h-[min(70vh,34rem)]"
            >
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="font-serif text-base text-ink-800">
                  Centro de notificaciones
                </h2>
                {count > 0 && (
                  <span className="text-caption text-ink-400 tabular-nums">
                    {count} pendiente{count === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {count > 0 ? (
                <div className="space-y-2">
                  {invitations.map((invitation) => (
                    <MomentoShareInvitationCard
                      key={invitation.id}
                      invitation={invitation}
                      pending={pending}
                      onRespond={onRespond}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-ink-100 bg-paper-100/45 px-3 py-4">
                  <p className="text-sm text-ink-700">No hay invitaciones pendientes.</p>
                  <p className="mt-1 text-caption text-ink-400">
                    Cuando alguien comparta Momentos contigo, podrás aceptar o rechazar
                    desde aquí.
                  </p>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-md p-1.5 text-ink-300 transition-colors hover:bg-ink-50 hover:text-ink-700"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          count > 0
            ? `Notificaciones, ${count} ${
                count === 1 ? 'invitación pendiente' : 'invitaciones pendientes'
              }`
            : 'Notificaciones'
        }
        title="Notificaciones"
      >
        <BellIcon size={14} />
        {count > 0 && (
          <span
            className="absolute -right-1 -top-1 min-w-[14px] rounded-full px-1 text-center text-[9px] leading-[14px] text-paper-50"
            style={{ backgroundColor: 'var(--accent-gold)' }}
            aria-hidden
          >
            {count}
          </span>
        )}
      </button>

      {panel}
    </div>
  )
}
