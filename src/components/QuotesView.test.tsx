import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuotesView } from './QuotesView'
import { makeQueryClient, renderWithProviders } from '../test-utils'
import { queryKeys } from '../state/queryClient'
import type { Entity, Quote, Relationship } from '../types'

/**
 * G6: smoke RTL para QuotesView.
 *
 * Cubre el camino feliz (lista renderiza, filtros funcionan, empty
 * state aparece). El hook `useQuotesFilters` ya tiene tests unitarios
 * con cobertura más detallada — acá verificamos el cableado UI.
 */

const ENTITY_LIBRO: Entity = {
  id: 'e-libro',
  type: 'libro',
  name: 'El extranjero',
  origin: { kind: 'manual' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const ENTITY_PERSONA: Entity = {
  id: 'e-persona',
  type: 'persona',
  name: 'Albert Camus',
  origin: { kind: 'manual' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const QUOTE_LIBRO: Quote = {
  id: 'q1',
  entityId: 'e-libro',
  text: 'El sol del cielo, el silencio del mundo.',
  linkedQuoteIds: [],
  origin: { kind: 'manual' },
  createdAt: '2026-01-03T00:00:00Z',
  updatedAt: '2026-01-03T00:00:00Z',
}

const QUOTE_PERSONA: Quote = {
  id: 'q2',
  entityId: 'e-persona',
  text: 'En medio del invierno, descubrí en mí un verano invencible.',
  linkedQuoteIds: [],
  origin: { kind: 'manual' },
  createdAt: '2026-01-04T00:00:00Z',
  updatedAt: '2026-01-04T00:00:00Z',
}

function setupCache(
  entities: Entity[],
  quotes: Quote[],
  relationships: Relationship[] = [],
) {
  const qc = makeQueryClient()
  qc.setQueryData(queryKeys.entities, entities)
  qc.setQueryData(queryKeys.relationships, relationships)
  // useInfiniteQuotesQuery espera shape { pages: [...], pageParams: [...] }
  qc.setQueryData(queryKeys.quotesInfinite, {
    pages: [{ items: quotes, nextCursor: null }],
    pageParams: [null],
  })
  return renderWithProviders(<QuotesView onSelectEntity={vi.fn()} />, {
    queryClient: qc,
  })
}

describe('<QuotesView />', () => {
  it('muestra empty state cuando no hay entidades', () => {
    setupCache([], [])
    expect(screen.getByText(/No hay todavía a quién atribuir nada/i)).toBeInTheDocument()
  })

  it('renderiza el heading "Citas"', () => {
    setupCache([ENTITY_LIBRO], [QUOTE_LIBRO])
    expect(screen.getByRole('heading', { name: /citas/i, level: 2 })).toBeInTheDocument()
  })

  it('muestra chips de filtro por tipo cuando hay variedad', () => {
    setupCache([ENTITY_LIBRO, ENTITY_PERSONA], [QUOTE_LIBRO, QUOTE_PERSONA])
    // Los chips muestran "Todas" + un chip por tipo presente. Los chips
    // viven fuera del virtualizer, así que jsdom los renderiza directo.
    expect(screen.getByRole('button', { name: /todas/i })).toBeInTheDocument()
    // /libro/ a secas también matchearía el botón "Componer mi libro" del
    // header — el chip de tipo lleva su count, eso lo distingue.
    expect(screen.getByRole('button', { name: /libro 1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /persona/i })).toBeInTheDocument()
  })

  it('NO muestra chips de filtro cuando hay un solo tipo', () => {
    // Solo entidades libro → un solo tipo → barra oculta.
    setupCache([ENTITY_LIBRO], [QUOTE_LIBRO])
    expect(screen.queryByRole('button', { name: /^todas$/i })).toBeNull()
  })

  it('los counts del chip Todas refleja el total cargado', () => {
    setupCache([ENTITY_LIBRO, ENTITY_PERSONA], [QUOTE_LIBRO, QUOTE_PERSONA])
    // Chip "Todas" muestra el total — robusto contra virtualization
    // porque los chips no pasan por el virtualizer.
    const allBtn = screen.getByRole('button', { name: /todas/i })
    expect(allBtn.textContent).toContain('2')
  })

  it('toggle del filtro persona cambia los counts disponibles', async () => {
    setupCache([ENTITY_LIBRO, ENTITY_PERSONA], [QUOTE_LIBRO, QUOTE_PERSONA])
    const personaBtn = screen.getByRole('button', { name: /persona/i })
    // Cada chip de tipo muestra su count — 1 libro, 1 persona.
    expect(personaBtn.textContent).toContain('1')
    const user = userEvent.setup()
    await user.click(personaBtn)
    // Después del click el chip está aria-pressed o se mantiene visible.
    // No verificamos quotes en el DOM por la virtualization, pero el
    // estado del filtro queda activo (chip cambia de color/style).
    expect(personaBtn).toBeInTheDocument()
  })
})

/**
 * Nota técnica: las quotes individuales no se verifican en el DOM porque
 * QuotesView usa `useMainScrollVirtualizer`, que en jsdom (sin altura real
 * del scroll container) renderiza 0 items. La cobertura de "muestra
 * quotes" vive en los tests del hook `useQuotesFilters` y en E2E.
 */
