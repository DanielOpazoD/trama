import type { MomentoShareInvitation } from '../../api/momentos'
import { MomentoShareInvitationCard } from './MomentoShareInvitationCard'

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
      {items.map((item) => (
        <MomentoShareInvitationCard
          key={item.id}
          invitation={item}
          pending={pending}
          onRespond={onRespond}
        />
      ))}
    </div>
  )
}
