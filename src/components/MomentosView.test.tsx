import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { MomentosView } from './MomentosView'
import { makeQueryClient, renderWithProviders } from '../test-utils'
import { queryKeys } from '../state/queryClient'

/**
 * Smoke tests para MomentosView. Verifica el render del shell (header,
 * composer, empty state) con responses vacíos. Por defecto el PIN no
 * está habilitado en tests, así que el AppPinGate (que está en App.tsx,
 * no acá) no aplica — solo el AppPinGate gate vive afuera del component
 * y nos da render directo.
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
      if (url.includes('/api/momentos')) {
        return jsonResp({ items: [], nextCursor: null })
      }
      if (url.includes('/api/entities')) {
        return jsonResp([])
      }
      return jsonResp([])
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<MomentosView />', () => {
  it('renders the view header with "Momentos" title', async () => {
    renderWithProviders(<MomentosView />)
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: 'Momentos' }),
      ).toBeInTheDocument()
    })
  })

  it('renders the composer for capturing a new momento', async () => {
    renderWithProviders(<MomentosView />)
    // El composer arranca COLAPSADO (una línea); se expande al clickear.
    const trigger = await screen.findByRole('button', {
      name: /escribir un nuevo momento/i,
    })
    fireEvent.click(trigger)
    await waitFor(() => {
      // Ya expandido: aparecen los tabs "Nota", "Recorte", "Foto".
      expect(screen.getByRole('button', { name: /^Nota$/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Recorte$/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Foto$/ })).toBeInTheDocument()
    })
  })

  it('shows the editorial empty message when no momentos exist', async () => {
    renderWithProviders(<MomentosView />)
    await waitFor(() => {
      expect(screen.getByText(/Todavía no hay momentos/i)).toBeInTheDocument()
    })
  })

  it('no muestra el bloque extra Diario vs Álbum', async () => {
    renderWithProviders(<MomentosView />)

    await screen.findByRole('button', { name: /compartir momentos/i })
    expect(screen.queryByLabelText('Modos de memoria')).not.toBeInTheDocument()
  })

  it('no ofrece escribir hoja suelta y arranca con Álbum como vista activa', async () => {
    renderWithProviders(<MomentosView />)

    await screen.findByRole('button', { name: /compartir momentos/i })
    expect(screen.queryByRole('button', { name: /escribir una hoja suelta/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Álbum' })).toHaveClass('bg-paper-100')
  })

  it('en álbum carga todas las páginas (todos los años), no solo la más reciente', async () => {
    // Regresión del bug: el álbum mostraba solo la primera página (el año más
    // reciente). El Paginator vive en el timeline, así que en álbum hay que
    // auto-cargar hasta agotar `nextCursor`. Aquí la página 1 trae cursor y la
    // 2 lo cierra; sin el fix, `cursor=p2` nunca se pediría.
    const momentosUrls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | Request | URL) => {
        const url = String(input)
        if (url.includes('/api/momentos')) {
          momentosUrls.push(url)
          return jsonResp({
            items: [],
            nextCursor: url.includes('cursor=') ? null : 'p2',
          })
        }
        return jsonResp([])
      }),
    )

    renderWithProviders(<MomentosView />)

    // La vista por defecto es Álbum → la página 2 se pide sola, sin clicks.
    await waitFor(() => {
      expect(momentosUrls.some((u) => u.includes('cursor=p2'))).toBe(true)
    })
  })

  it('no muestra el empty state falso mientras el álbum aún auto-carga páginas', async () => {
    // La 1ª página vuelve vacía pero con `nextCursor` (el caso del filtro Videos:
    // fotos sin clips). Hasta agotar las páginas se ve un pie sereno, no el
    // "Todavía no hay momentos." falso. La 2ª queda pendiente a propósito.
    let resolvePage2: (r: Response) => void = () => {}
    const page2 = new Promise<Response>((resolve) => {
      resolvePage2 = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | Request | URL) => {
        const url = String(input)
        if (url.includes('/api/momentos')) {
          if (url.includes('cursor=')) return page2
          return jsonResp({ items: [], nextCursor: 'p2' })
        }
        return jsonResp([])
      }),
    )

    renderWithProviders(<MomentosView />)

    // Con la 2ª página en vuelo: pie sereno, NO el empty state.
    await screen.findByText('recogiendo tus momentos…')
    expect(screen.queryByText(/Todavía no hay momentos/i)).toBeNull()

    // Al cerrarse la última página (vacía, sin cursor), sí es vacío de verdad.
    resolvePage2(jsonResp({ items: [], nextCursor: null }))
    await screen.findByText(/Todavía no hay momentos/i)
  })

  it('abre el control general para compartir todos los Momentos', async () => {
    renderWithProviders(<MomentosView />)

    const share = await screen.findByRole('button', { name: /compartir momentos/i })
    fireEvent.click(share)

    expect(
      screen.getByRole('heading', { name: /compartir momentos/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/correo/i)).toBeInTheDocument()
  })

  it('no duplica invitaciones pendientes en el cuerpo de Momentos', async () => {
    const queryClient = makeQueryClient()
    queryClient.setQueryData(queryKeys.momentoShareInvitations, {
      items: [
        {
          id: 'inv1',
          inviterUserId: 'user-papa',
          inviterDisplayName: 'Papá',
          inviteeEmail: 'mama@example.com',
          role: 'editor',
          status: 'pending',
          createdAt: '2026-06-10T12:00:00.000Z',
          updatedAt: '2026-06-10T12:00:00.000Z',
        },
      ],
    })

    renderWithProviders(<MomentosView />, { queryClient })

    await screen.findByRole('button', { name: /compartir momentos/i })
    expect(
      screen.queryByText(/Papá compartió sus Momentos contigo/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Invitaciones de momentos/i)).not.toBeInTheDocument()
  })
})
