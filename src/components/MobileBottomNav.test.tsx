import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { MobileBottomNav } from './MobileBottomNav'
import { renderWithProviders } from '../test-utils'

beforeEach(() => {
  // Mockear los endpoints que el bottom nav consulta vía TanStack Query.
  // Devolvemos respuestas vacías estables — el componente solo lee counts
  // y pending suggestions para decorar el chrome.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/api/momentos-share-invitations')) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({ entities: 0, quotes: 0, momentos: 0, relationships: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<MobileBottomNav />', () => {
  it('renders all nav items with their accessible labels', () => {
    renderWithProviders(<MobileBottomNav view="inicio" onChangeView={() => {}} />)
    const expectedLabels = [
      'Inicio',
      'Entidades',
      'Citas',
      'Momentos',
      'Grafo',
      'Recortes',
      'Chat',
    ]
    for (const label of expectedLabels) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    // Las secciones retiradas del nav ya no aparecen.
    for (const gone of [
      'Escuchas',
      'Twitter',
      'Cronología',
      'Atlas',
      'Sugerencias',
      'Flujo',
    ]) {
      expect(screen.queryByRole('button', { name: gone })).not.toBeInTheDocument()
    }
  })

  it('marks the active view with aria-current="page"', () => {
    renderWithProviders(<MobileBottomNav view="citas" onChangeView={() => {}} />)
    const citasBtn = screen.getByRole('button', { name: 'Citas' })
    expect(citasBtn).toHaveAttribute('aria-current', 'page')

    const grafoBtn = screen.getByRole('button', { name: 'Grafo' })
    expect(grafoBtn).not.toHaveAttribute('aria-current')
  })

  it('calls onChangeView with the clicked view value', () => {
    const onChange = vi.fn()
    renderWithProviders(<MobileBottomNav view="inicio" onChangeView={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
    expect(onChange).toHaveBeenCalledWith('chat')
  })

  it('uses aria-label "Navegación principal" on the nav landmark', () => {
    renderWithProviders(<MobileBottomNav view="inicio" onChangeView={() => {}} />)
    expect(
      screen.getByRole('navigation', { name: /Navegación principal/i }),
    ).toBeInTheDocument()
  })

  it('muestra invitaciones pendientes en el botón Momentos', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/api/momentos-share-invitations')) {
        return new Response(JSON.stringify({ items: [{ id: 'inv1' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({ entities: 0, quotes: 0, momentos: 0, relationships: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    renderWithProviders(<MobileBottomNav view="inicio" onChangeView={() => {}} />)

    expect(
      await screen.findByRole('button', { name: /Momentos 1 invitación/i }),
    ).toBeInTheDocument()
  })

  it('tolera respuestas legacy sin items para invitaciones compartidas', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/api/momentos-share-invitations')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({ entities: 0, quotes: 0, momentos: 0, relationships: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    renderWithProviders(<MobileBottomNav view="inicio" onChangeView={() => {}} />)

    expect(await screen.findByRole('button', { name: 'Momentos' })).toBeInTheDocument()
  })
})
