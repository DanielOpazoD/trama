/**
 * BB8: tests UI de EntityForm (BB7-extracted). Cubre los flujos clave:
 *   - render básico de inputs + select de tipos
 *   - submit con name vacío rechaza sin llamar al server
 *   - submit válido invoca api.createEntity
 *   - DuplicateEntityError → render del bloque "¿es la misma entidad?"
 *   - Cancelar invoca onClose
 *
 * El lookup proactivo con debounce es trickier (timers + microtasks);
 * lo dejamos cubierto a nivel de hook por separado, no acá.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EntityForm } from './EntityForm'
import { renderWithProviders } from '../../test-utils'
import * as apiModule from '../../api'
import { DuplicateEntityError } from '../../api'

const here = dirname(fileURLToPath(import.meta.url))

beforeEach(() => {
  vi.restoreAllMocks()
  // El lookup proactivo dispara al teclear; mock como no-op para no
  // contaminar los expects de createEntity.
  vi.spyOn(apiModule.api, 'lookupEntitiesByPrefix').mockResolvedValue([])
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('EntityForm', () => {
  it('no castea clicks de botón como submit events', () => {
    const source = readFileSync(join(here, 'EntityForm.tsx'), 'utf8')

    expect(source).not.toContain('as unknown as FormEvent')
  })

  it('renderiza inputs (nombre, año, descripción) y select de tipo', () => {
    renderWithProviders(<EntityForm onClose={() => {}} allLoadedEntities={[]} />)
    expect(screen.getByPlaceholderText('Nombre')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Año')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Nota o descripción/)).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('no llama api.createEntity si name está vacío', () => {
    const spy = vi.spyOn(apiModule.api, 'createEntity').mockResolvedValue({} as never)
    renderWithProviders(<EntityForm onClose={() => {}} allLoadedEntities={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /^Añadir$/ }))
    expect(spy).not.toHaveBeenCalled()
  })

  it('llama api.createEntity con los campos del form', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(apiModule.api, 'createEntity').mockResolvedValue({
      id: 'e-new',
      type: 'persona',
      name: 'Camus',
      origin: { kind: 'manual' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })
    renderWithProviders(<EntityForm onClose={() => {}} allLoadedEntities={[]} />)

    await user.type(screen.getByPlaceholderText('Nombre'), 'Camus')
    await user.type(screen.getByPlaceholderText('Año'), '1913')
    fireEvent.click(screen.getByRole('button', { name: /^Añadir$/ }))

    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy.mock.calls[0]![0]).toMatchObject({
      name: 'Camus',
      year: 1913,
      type: 'persona',
    })
  })

  it('muestra dup candidates cuando server responde DuplicateEntityError', async () => {
    const user = userEvent.setup()
    vi.spyOn(apiModule.api, 'createEntity').mockRejectedValue(
      new DuplicateEntityError([
        {
          id: 'e-existing',
          name: 'Albert Camus',
          type: 'escritor',
          description: 'argelino-francés',
          similarity: 0.87,
        },
      ]),
    )
    renderWithProviders(<EntityForm onClose={() => {}} allLoadedEntities={[]} />)

    await user.type(screen.getByPlaceholderText('Nombre'), 'Camus')
    fireEvent.click(screen.getByRole('button', { name: /^Añadir$/ }))

    await waitFor(() => {
      expect(screen.getByText(/¿es la misma entidad?/i)).toBeInTheDocument()
      expect(screen.getByText('Albert Camus')).toBeInTheDocument()
    })
  })

  it('botón Cancelar invoca onClose', () => {
    const onClose = vi.fn()
    renderWithProviders(<EntityForm onClose={onClose} allLoadedEntities={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
