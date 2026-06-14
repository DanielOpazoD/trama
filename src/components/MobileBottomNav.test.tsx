import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { MobileBottomNav } from './MobileBottomNav'
import { renderWithProviders } from '../test-utils'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  // Mockear los endpoints que el bottom nav consulta vía TanStack Query.
  // Respuestas vacías estables — el componente solo lee counts, invitaciones
  // y sugerencias pendientes para decorar el chrome.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/api/momentos-share-invitations')) {
        return jsonResponse({ items: [] })
      }
      if (url.includes('/api/proactive-suggestions')) {
        return jsonResponse([])
      }
      return jsonResponse({ entities: 0, quotes: 0, momentos: 0, relationships: 0 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<MobileBottomNav />', () => {
  it('muestra 4 vistas primarias + el botón "Más" (5 slots)', () => {
    renderWithProviders(<MobileBottomNav view="inicio" onChangeView={() => {}} />)
    for (const label of ['Inicio', 'Entidades', 'Citas', 'Momentos']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Más vistas' })).toBeInTheDocument()

    // Las vistas no-primarias NO están en la barra cuando la hoja está cerrada
    // (viven dentro de "Más"). Antes Grafo/Recortes/Chat sí estaban sueltos.
    for (const hidden of [
      'Grafo',
      'Recortes',
      'Chat',
      'Escuchas',
      'Twitter',
      'Cronología',
      'Atlas',
      'Sugerencias',
      'Flujo',
    ]) {
      expect(screen.queryByRole('button', { name: hidden })).not.toBeInTheDocument()
    }
  })

  it('marca la vista activa con aria-current="page"', () => {
    renderWithProviders(<MobileBottomNav view="citas" onChangeView={() => {}} />)
    expect(screen.getByRole('button', { name: 'Citas' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: 'Inicio' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('llama onChangeView con la vista primaria clickeada', () => {
    const onChange = vi.fn()
    renderWithProviders(<MobileBottomNav view="inicio" onChangeView={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entidades' }))
    expect(onChange).toHaveBeenCalledWith('entidades')
  })

  it('"Más" abre la hoja con TODAS las vistas no-primarias', () => {
    renderWithProviders(<MobileBottomNav view="inicio" onChangeView={() => {}} />)
    // Antes de abrir, ninguna vista oculta está en el DOM.
    expect(screen.queryByRole('button', { name: 'Escuchas' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Más vistas' }))

    // La hoja (portal) lista las vistas no-primarias. Recortes ya no figura:
    // se mudó al mundo Notas como la sección "bandeja".
    const dialog = screen.getByRole('dialog', { name: /Más vistas/i })
    expect(dialog).toBeInTheDocument()
    for (const v of [
      'Escuchas',
      'Twitter',
      'Grafo',
      'Cronología',
      'Atlas',
      'Chat',
      'Sugerencias',
    ]) {
      expect(screen.getByRole('button', { name: v })).toBeInTheDocument()
    }
    // Recortes ya no es una vista (ni primaria ni en la hoja).
    expect(screen.queryByRole('button', { name: 'Recortes' })).not.toBeInTheDocument()
  })

  it('elegir una vista en la hoja llama onChangeView y la cierra', () => {
    const onChange = vi.fn()
    renderWithProviders(<MobileBottomNav view="inicio" onChangeView={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Más vistas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Escuchas' }))
    expect(onChange).toHaveBeenCalledWith('escuchas')
    // La hoja se cierra al elegir.
    expect(screen.queryByRole('dialog', { name: /Más vistas/i })).not.toBeInTheDocument()
  })

  it('"Más" queda marcado como actual cuando la vista activa vive en la hoja', () => {
    renderWithProviders(<MobileBottomNav view="grafo" onChangeView={() => {}} />)
    // Grafo no es primaria → su slot es "Más", que toma el aria-current.
    expect(screen.getByRole('button', { name: 'Más vistas' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('cierra la hoja con la tecla Escape', () => {
    renderWithProviders(<MobileBottomNav view="inicio" onChangeView={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Más vistas' }))
    expect(screen.getByRole('dialog', { name: /Más vistas/i })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /Más vistas/i })).not.toBeInTheDocument()
  })

  it('usa aria-label "Navegación principal" en el landmark', () => {
    renderWithProviders(<MobileBottomNav view="inicio" onChangeView={() => {}} />)
    expect(
      screen.getByRole('navigation', { name: /Navegación principal/i }),
    ).toBeInTheDocument()
  })

  it('muestra invitaciones pendientes en el botón Momentos', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/api/momentos-share-invitations')) {
        return jsonResponse({ items: [{ id: 'inv1' }] })
      }
      if (url.includes('/api/proactive-suggestions')) {
        return jsonResponse([])
      }
      return jsonResponse({ entities: 0, quotes: 0, momentos: 0, relationships: 0 })
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
        return jsonResponse([])
      }
      if (url.includes('/api/proactive-suggestions')) {
        return jsonResponse([])
      }
      return jsonResponse({ entities: 0, quotes: 0, momentos: 0, relationships: 0 })
    })

    renderWithProviders(<MobileBottomNav view="inicio" onChangeView={() => {}} />)

    expect(await screen.findByRole('button', { name: 'Momentos' })).toBeInTheDocument()
  })
})
