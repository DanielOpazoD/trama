import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { CommandPalette } from './CommandPalette'
import { renderWithProviders } from '../test-utils'

/**
 * Smoke tests para CommandPalette: verifica navegación + filtrado +
 * acciones quick. Mockeamos /api/entities y /api/quotes con respuestas
 * pequeñas; el componente usa useEntitiesQuery + useQuotesQuery.
 */

function jsonResp(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/api/entities')) {
        return jsonResp([
          {
            id: 'e-borges',
            type: 'escritor',
            name: 'Borges',
            year: 1899,
            description: 'escritor argentino',
            origin: { kind: 'manual' },
          },
        ])
      }
      if (url.includes('/api/quotes')) {
        return jsonResp([])
      }
      return jsonResp([])
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<CommandPalette />', () => {
  it('does not render when open=false', () => {
    renderWithProviders(
      <CommandPalette
        open={false}
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders with search input + view options when open', () => {
    renderWithProviders(
      <CommandPalette
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    expect(screen.getByRole('dialog', { name: /buscar/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/buscar/i)).toBeInTheDocument()
    // Las 8 vistas aparecen en la lista inicial
    expect(screen.getByText('Inicio')).toBeInTheDocument()
    expect(screen.getByText('Grafo')).toBeInTheDocument()
    expect(screen.getByText('Citas')).toBeInTheDocument()
  })

  it('filters by query — typing "entid" shrinks results', () => {
    const { container } = renderWithProviders(
      <CommandPalette
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    const input = screen.getByPlaceholderText(/buscar/i)
    fireEvent.change(input, { target: { value: 'entid' } })
    // El highlight parte "Entidades" en múltiples elementos (<strong>);
    // chequeamos por textContent del list.
    const list = container.querySelector('ul')!
    expect(list.textContent).toMatch(/Entidades/)
    // "Inicio" desaparece porque no contiene "entid"
    expect(list.textContent).not.toMatch(/Inicio/)
  })

  it('exposes quick actions when onAction is provided', () => {
    renderWithProviders(
      <CommandPalette
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
        onAction={() => {}}
      />,
    )
    expect(screen.getByText('Nueva entidad')).toBeInTheDocument()
    expect(screen.getByText('Nueva cita')).toBeInTheDocument()
    expect(screen.getByText('Configuración')).toBeInTheDocument()
  })

  it('hides quick actions when onAction is not provided', () => {
    renderWithProviders(
      <CommandPalette
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    expect(screen.queryByText('Nueva entidad')).not.toBeInTheDocument()
  })

  it('calls onClose when ESC is pressed', () => {
    const onClose = vi.fn()
    renderWithProviders(
      <CommandPalette
        open
        onClose={onClose}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
