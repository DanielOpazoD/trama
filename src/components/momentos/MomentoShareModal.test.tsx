import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { renderWithProviders } from '../../test-utils'
import { MomentoShareModal } from './MomentoShareModal'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('<MomentoShareModal />', () => {
  it('invita por email al espacio completo de Momentos y cierra al guardar', async () => {
    vi.spyOn(api, 'listMomentoShareAccess').mockResolvedValue({ items: [] })
    const create = vi.spyOn(api, 'createMomentoShareInvitation').mockResolvedValueOnce({
      id: 'inv1',
      inviterUserId: 'owner',
      inviteeEmail: 'papa@example.com',
      role: 'editor',
      status: 'pending',
      createdAt: '2026-06-10T12:00:00.000Z',
      updatedAt: '2026-06-10T12:00:00.000Z',
    })
    const onClose = vi.fn()

    renderWithProviders(<MomentoShareModal onClose={onClose} />)

    expect(
      screen.getByText(/Compartir todos mis Momentos con este correo/i),
    ).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/correo/i), 'Papa@Example.com')
    await userEvent.click(screen.getByRole('radio', { name: /editar/i }))
    await userEvent.click(screen.getByRole('button', { name: /invitar/i }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith({
      email: 'Papa@Example.com',
      role: 'editor',
    })
  })

  it('muestra personas con acceso y permite revocar', async () => {
    vi.spyOn(api, 'listMomentoShareAccess').mockResolvedValue({
      items: [
        {
          userId: 'user-papa',
          displayName: 'Papá',
          email: 'papa@example.com',
          role: 'viewer',
          acceptedAt: '2026-06-10T12:00:00.000Z',
        },
      ],
    })
    const revoke = vi
      .spyOn(api, 'revokeMomentoShareAccess')
      .mockResolvedValueOnce({ revoked: true })

    renderWithProviders(<MomentoShareModal onClose={vi.fn()} />)

    expect(await screen.findByText('Papá')).toBeInTheDocument()
    expect(screen.getByText('papa@example.com')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /revocar acceso/i }))

    await waitFor(() => expect(revoke).toHaveBeenCalledWith('user-papa'))
  })

  it('tolera respuestas legacy sin items para la lista de accesos', async () => {
    vi.spyOn(api, 'listMomentoShareAccess').mockResolvedValue([] as never)

    renderWithProviders(<MomentoShareModal onClose={vi.fn()} />)

    expect(await screen.findByText(/Sin accesos aceptados todavía/i)).toBeInTheDocument()
  })
})
