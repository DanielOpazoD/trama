import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MomentoShareInvitation } from '../../api/momentos'
import { MomentoNotificationsCenter } from './MomentoNotificationsCenter'

const invitation: MomentoShareInvitation = {
  id: 'inv-1',
  inviterUserId: 'user-mama',
  inviterDisplayName: 'Mamá',
  inviterEmail: 'mama@example.com',
  inviteeEmail: 'papa@example.com',
  role: 'editor',
  status: 'pending',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-10T12:00:00.000Z',
}

describe('<MomentoNotificationsCenter />', () => {
  it('muestra contador global y permite aceptar una invitación', async () => {
    const user = userEvent.setup()
    const onRespond = vi.fn()

    render(
      <MomentoNotificationsCenter
        invitations={[invitation]}
        pending={false}
        onRespond={onRespond}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: /notificaciones.*1 invitación/i }),
    )

    expect(
      screen.getByRole('dialog', { name: /centro de notificaciones/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Mamá compartió sus Momentos contigo/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /aceptar invitación de mamá/i }))

    expect(onRespond).toHaveBeenCalledWith('inv-1', 'accept')
  })

  it('mantiene un estado vacío pulido', async () => {
    const user = userEvent.setup()

    render(
      <MomentoNotificationsCenter invitations={[]} pending={false} onRespond={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: /notificaciones/i }))

    expect(screen.getByText(/No hay invitaciones pendientes/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Cuando alguien comparta Momentos contigo/i),
    ).toBeInTheDocument()
  })
})
