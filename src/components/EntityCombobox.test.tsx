import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import type { Entity } from '../types'
import { EntityCombobox } from './EntityCombobox'

const borges: Entity = {
  id: 'e1',
  name: 'Borges',
  type: 'escritor',
  origin: { kind: 'manual' },
  createdAt: '2026-05-20T10:00:00.000Z',
  updatedAt: '2026-05-20T10:00:00.000Z',
}

const ficciones: Entity = {
  id: 'e2',
  name: 'Ficciones',
  type: 'libro',
  origin: { kind: 'manual' },
  createdAt: '2026-05-20T10:00:00.000Z',
  updatedAt: '2026-05-20T10:00:00.000Z',
}

describe('<EntityCombobox />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('busca con debounce, filtra excludeId y selecciona con teclado', async () => {
    const onChange = vi.fn()
    const lookupSpy = vi
      .spyOn(api, 'lookupEntitiesByPrefix')
      .mockResolvedValue([borges, ficciones])

    render(
      <EntityCombobox
        value={null}
        onChange={onChange}
        excludeId="e1"
        placeholder="buscar entidad"
      />,
    )

    const input = screen.getByPlaceholderText(/buscar entidad/i)
    fireEvent.focus(input)
    expect(screen.getByText(/escribe para buscar/i)).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'bor' } })
    expect(screen.getByText(/buscando/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(lookupSpy).toHaveBeenCalledWith('bor')
      expect(screen.queryByRole('option', { name: /Borges/i })).toBeNull()
      expect(screen.getByRole('option', { name: /Ficciones/i })).toBeInTheDocument()
    })

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(ficciones)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('muestra chip seleccionado y permite limpiarlo sin fetch extra', () => {
    const onChange = vi.fn()
    const lookupSpy = vi.spyOn(api, 'lookupEntitiesByPrefix')

    render(<EntityCombobox value="e1" selectedName="Borges" onChange={onChange} />)

    expect(screen.getByText('Borges')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /cambiar entidad/i }))

    expect(onChange).toHaveBeenCalledWith(null)
    expect(lookupSpy).not.toHaveBeenCalled()
  })
})
