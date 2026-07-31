import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { Secret } from '../../api'
import { renderWithProviders } from '../../test-utils'
import { SecretCard } from './ClavesVaultParts'

const clave: Secret = {
  id: 's1',
  label: 'OpenAI',
  kind: 'api_key',
  service: null,
  username: null,
  notes: null,
  favorite: false,
  critical: false,
  expiresAt: null,
  lastRotatedAt: null,
  copiedAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}

function montar(overrides: Partial<Parameters<typeof SecretCard>[0]> = {}) {
  const props = {
    item: clave,
    metadata: null,
    value: null,
    busy: false,
    onReveal: vi.fn(),
    onCopy: vi.fn(),
    onFavorite: vi.fn(),
    onDelete: vi.fn(),
    onSaveEdit: vi.fn(),
    ...overrides,
  }
  renderWithProviders(<SecretCard {...props} />)
  return props
}

describe('<SecretCard />', () => {
  /**
   * La convención de las otras seis tarjetas: lo primario a la vista, lo
   * ocasional tras el ⋯. Aquí lo primario es sacar la clave del llavero
   * —revelarla y copiarla—; con veinte claves, cinco controles por tarjeta
   * eran cien botones en pantalla.
   */
  it('deja a la vista revelar y copiar, y esconde el resto tras el ⋯', () => {
    montar()

    expect(screen.getByRole('button', { name: 'revelar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copiar clave' })).toBeInTheDocument()

    // Editar, favorita y borrar ya no son botones sueltos en la cara.
    expect(screen.queryByRole('button', { name: 'Editar clave' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Borrar clave' })).toBeNull()
    expect(screen.queryByRole('button', { name: /favorita/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Acciones de la clave' }))
    expect(screen.getByRole('menuitem', { name: /Editar/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Favorita/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Borrar' })).toBeInTheDocument()
  })

  /**
   * Borrar una clave es el borrado MENOS reversible de la app: el backend la
   * marca con `deleted_at`, pero no hay endpoint de restauración ni toast de
   * Deshacer —a diferencia de citas y tareas—. Aun así era el único que se
   * hacía de un solo clic, sobre el dato más valioso que guarda el programa.
   */
  it('borrar exige confirmación', () => {
    const { onDelete } = montar()

    fireEvent.click(screen.getByRole('button', { name: 'Acciones de la clave' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Borrar' }))

    expect(onDelete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Sí, borrar' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  /**
   * La tarjeta ya marcaba «favorita» junto al título, así que el botón del pie
   * era la única forma de alternarlo — no de saberlo. El marcador se queda; el
   * botón se va al menú.
   */
  it('una clave favorita lo dice junto al título, sin gastar un control', () => {
    montar({ item: { ...clave, favorite: true } })

    expect(screen.getAllByText('favorita')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /favorita/i })).toBeNull()
  })
})
