import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EntitiesView } from './EntitiesView'
import { makeQueryClient, renderWithProviders } from '../test-utils'
import { queryKeys } from '../state/queryClient'
import type { Entity } from '../types'

/**
 * EntitiesView renderiza una lista virtualizada con TanStack Virtual.
 * En jsdom las celdas internas no se renderizan porque no hay scroll
 * real ni layout. Los tests se enfocan en el header (chips de filtro,
 * botón "Añadir", CTA de reclasificar), no en las filas — eso se cubre
 * con E2E en Playwright.
 */
function mkEntity(id: string, type: string, name: string): Entity {
  return {
    id,
    type,
    name,
    origin: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

function seedEntities(entities: Entity[]) {
  const qc = makeQueryClient()
  qc.setQueryData(queryKeys.entitiesInfinite, {
    pages: [{ items: entities, nextCursor: null }],
    pageParams: [null],
  })
  qc.setQueryData(queryKeys.entities, entities)
  qc.setQueryData(queryKeys.quotes, [])
  qc.setQueryData(queryKeys.relationships, [])
  return qc
}

describe('<EntitiesView />', () => {
  it('muestra el empty state cuando no hay entidades', () => {
    const qc = seedEntities([])
    renderWithProviders(<EntitiesView />, { queryClient: qc })
    expect(screen.getByText(/Todavía nadie habita la trama/i)).toBeInTheDocument()
  })

  it('NO muestra chips de filtro cuando solo hay un tipo', () => {
    const ents = [
      mkEntity('e1', 'persona', 'Borges'),
      mkEntity('e2', 'persona', 'Cortázar'),
    ]
    const qc = seedEntities(ents)
    renderWithProviders(<EntitiesView />, { queryClient: qc })
    expect(screen.queryByRole('button', { name: /^Todos/i })).toBeNull()
  })

  it('muestra chips de filtro cuando hay 2+ tipos', () => {
    const ents = [mkEntity('e1', 'persona', 'Borges'), mkEntity('e2', 'libro', 'Rayuela')]
    const qc = seedEntities(ents)
    renderWithProviders(<EntitiesView />, { queryClient: qc })
    expect(screen.getByRole('button', { name: /^Todos/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /persona/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /libro/i })).toBeInTheDocument()
  })

  it('los chips muestran el conteo por tipo', () => {
    const ents = [
      mkEntity('e1', 'persona', 'Borges'),
      mkEntity('e2', 'persona', 'Cortázar'),
      mkEntity('e3', 'persona', 'Pizarnik'),
      mkEntity('e4', 'libro', 'Rayuela'),
    ]
    const qc = seedEntities(ents)
    renderWithProviders(<EntitiesView />, { queryClient: qc })
    // Chip Todos con 4
    const todos = screen.getByRole('button', { name: /^Todos/i })
    expect(todos.textContent).toMatch(/4/)
    // Chip persona con 3 (mayor primero por sort por count)
    const persona = screen.getByRole('button', { name: /persona/i })
    expect(persona.textContent).toMatch(/3/)
    // Chip libro con 1
    const libro = screen.getByRole('button', { name: /libro/i })
    expect(libro.textContent).toMatch(/1/)
  })

  it('toggle del form "Añadir": click revela los inputs', async () => {
    const qc = seedEntities([])
    renderWithProviders(<EntitiesView />, { queryClient: qc })
    expect(screen.queryByPlaceholderText(/nombre/i)).toBeNull()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^Añadir/i }))
    expect(screen.getByPlaceholderText(/nombre/i)).toBeInTheDocument()
  })

  it('click en chip de tipo y luego en "Todos" — el chip activo cambia', async () => {
    const ents = [mkEntity('e1', 'persona', 'Borges'), mkEntity('e2', 'libro', 'Rayuela')]
    const qc = seedEntities(ents)
    renderWithProviders(<EntitiesView />, { queryClient: qc })
    const user = userEvent.setup()
    const todos = screen.getByRole('button', { name: /^Todos/i })
    const libroChip = screen.getByRole('button', { name: /libro/i })

    // Click en libro lo activa (background visible vía clase font-medium)
    await user.click(libroChip)
    expect(libroChip.className).toMatch(/font-medium/)
    expect(todos.className).not.toMatch(/font-medium/)

    // Click en Todos lo activa
    await user.click(todos)
    expect(todos.className).toMatch(/font-medium/)
    expect(libroChip.className).not.toMatch(/font-medium/)
  })

  it('muestra el menú IA cuando hay 2+ entidades', () => {
    // AA-B: el botón "reclasificar con IA" se convirtió en un menú
    // "IA ▾" que despliega opciones. Ahora chequeamos el trigger del
    // menú; la opción "Reclasificar tipos" vive dentro al abrir.
    const ents = [mkEntity('e1', 'persona', 'Borges'), mkEntity('e2', 'libro', 'Rayuela')]
    const qc = seedEntities(ents)
    renderWithProviders(<EntitiesView />, { queryClient: qc })
    // Botón con texto IA y aria-haspopup="menu" — usamos title.
    expect(screen.getByRole('button', { name: /acciones con ia/i })).toBeInTheDocument()
  })
})
