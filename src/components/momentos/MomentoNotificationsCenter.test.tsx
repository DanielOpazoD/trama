import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  afterEach(() => {
    document.body.style.overflow = ''
  })

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

  it('usa un panel fijo y legible en navegación móvil', async () => {
    const user = userEvent.setup()

    render(
      <MomentoNotificationsCenter
        invitations={[invitation]}
        pending={false}
        onRespond={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: /notificaciones.*1 invitación/i }),
    )

    const dialog = screen.getByRole('dialog', { name: /centro de notificaciones/i })
    expect(dialog).toHaveClass('fixed')
    expect(dialog).toHaveClass('left-3')
    expect(dialog).toHaveClass('right-3')
    expect(dialog).toHaveClass('sm:top-14')
  })

  it('monta el panel fuera del TopBar para evitar bugs de transform en mobile', async () => {
    const user = userEvent.setup()

    render(
      <div style={{ transform: 'translateY(0)' }}>
        <MomentoNotificationsCenter
          invitations={[invitation]}
          pending={false}
          onRespond={vi.fn()}
        />
      </div>,
    )

    await user.click(
      screen.getByRole('button', { name: /notificaciones.*1 invitación/i }),
    )

    const layer = screen.getByTestId('momento-notifications-layer')
    expect(layer.parentElement).toBe(document.body)
    expect(layer).toHaveClass('fixed')
    expect(layer).toHaveClass('z-[80]')
    expect(
      screen.getByRole('button', { name: /aceptar invitación de mamá/i }),
    ).toBeEnabled()
  })

  it('cierra con Escape y devuelve el foco al botón de notificaciones', async () => {
    const user = userEvent.setup()

    render(
      <MomentoNotificationsCenter
        invitations={[invitation]}
        pending={false}
        onRespond={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', {
      name: /notificaciones.*1 invitación/i,
    })
    trigger.focus()
    await user.click(trigger)

    expect(
      screen.getByRole('dialog', { name: /centro de notificaciones/i }),
    ).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /centro de notificaciones/i }),
      ).not.toBeInTheDocument()
    })
    expect(document.activeElement).toBe(trigger)
  })

  it('bloquea el scroll del fondo mientras el panel está abierto y lo restaura al cerrar', async () => {
    const user = userEvent.setup()
    document.body.style.overflow = 'auto'

    render(
      <MomentoNotificationsCenter
        invitations={[invitation]}
        pending={false}
        onRespond={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: /notificaciones.*1 invitación/i }),
    )

    expect(document.body.style.overflow).toBe('hidden')

    await user.click(
      screen.getByRole('button', { name: /cerrar centro de notificaciones/i }),
    )

    await waitFor(() => {
      expect(document.body.style.overflow).toBe('auto')
    })
  })

  it('restaura el scroll del fondo si el panel se desmonta abierto', async () => {
    const user = userEvent.setup()
    document.body.style.overflow = 'auto'

    const { unmount } = render(
      <MomentoNotificationsCenter
        invitations={[invitation]}
        pending={false}
        onRespond={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: /notificaciones.*1 invitación/i }),
    )
    expect(document.body.style.overflow).toBe('hidden')

    act(() => {
      unmount()
    })

    expect(document.body.style.overflow).toBe('auto')
  })
})
