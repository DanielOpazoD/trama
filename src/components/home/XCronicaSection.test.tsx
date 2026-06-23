import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { XCronicaSection } from './XCronicaSection'
import { renderWithProviders } from '../../test-utils'
import type { XCronica } from '../../api'

/**
 * Tests de XCronicaSection en Inicio. La sección es condicional: solo aparece
 * si ya hay una crónica. Lo crítico que blindamos acá es que un fallo de carga
 * NO se confunda con "todavía no hay crónica" (que antes era el mismo
 * `return null`): un error debe rendererse como <ErrorState /> con opción de
 * reintentar, para no empujar al usuario a regenerar (IA cara) por un problema
 * quizá temporal.
 *
 * Mockeamos GET /api/x/cronica con `fetch`, igual que AtlasView.test.tsx.
 */

const CRONICA: XCronica = {
  id: 'cr-1',
  text: 'Lo que guardaste este mes dibuja un mapa de obsesiones.',
  sourceCount: 12,
  generatedAt: '2026-05-20T12:00:00.000Z',
  provider: 'deepseek',
  model: 'deepseek-chat',
}

function stubFetch(handler: (url: string) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL) => handler(String(input))),
  )
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<XCronicaSection />', () => {
  it('renderiza la crónica cuando la carga tiene éxito', async () => {
    stubFetch((url) =>
      url.includes('/api/x/cronica') ? ok({ cronica: CRONICA }) : ok({}),
    )
    renderWithProviders(<XCronicaSection />)
    expect(await screen.findByText(/mapa de obsesiones/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('no renderiza nada (vacío real) cuando no hay crónica', async () => {
    stubFetch((url) => (url.includes('/api/x/cronica') ? ok({ cronica: null }) : ok({})))
    const { container } = renderWithProviders(<XCronicaSection />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
    // El vacío real NO debe gritar error.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('muestra ErrorState (no el vacío silencioso) cuando la carga falla', async () => {
    stubFetch((url) => {
      if (url.includes('/api/x/cronica')) return new Response('boom', { status: 500 })
      return ok({})
    })
    renderWithProviders(<XCronicaSection />)
    // El fallo se nombra como error, con role="alert" para lectores de pantalla.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no se pudo cargar tu crónica/i,
    )
    // Y ofrece reintentar en vez de desaparecer en silencio.
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })
})
