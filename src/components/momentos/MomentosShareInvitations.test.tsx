import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MomentoShareInvitation } from '../../api/momentos'
import { MomentosShareInvitations } from './MomentosShareInvitations'

const invitation: MomentoShareInvitation = {
  id: 'inv1',
  inviterUserId: 'user-papa',
  inviterDisplayName: 'Papá',
  inviteeEmail: 'mama@example.com',
  role: 'editor',
  status: 'pending',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-10T12:00:00.000Z',
}

describe('<MomentosShareInvitations />', () => {
  it('muestra permiso y permite aceptar o rechazar', () => {
    const onRespond = vi.fn()
    render(
      <MomentosShareInvitations
        items={[invitation]}
        pending={false}
        onRespond={onRespond}
      />,
    )

    expect(screen.getByText(/Papá compartió sus Momentos contigo/i)).toBeInTheDocument()
    expect(screen.getByText(/puede editar/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /aceptar/i }))
    fireEvent.click(screen.getByRole('button', { name: /rechazar/i }))

    expect(onRespond).toHaveBeenNthCalledWith(1, 'inv1', 'accept')
    expect(onRespond).toHaveBeenNthCalledWith(2, 'inv1', 'reject')
  })
})
