import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { QuoteEchoesPanel } from './QuoteEchoesPanel'
import { renderWithProviders } from '../../test-utils'

/**
 * U-2: Eco. El panel es marginalia opcional: render-null mientras carga y
 * cuando no hay ecos. Pero un fetch FALLIDO no es lo mismo que "no hay
 * ecos" — debe nombrarse como error (ErrorState con reintentar), no
 * colapsarse en el silencio que parece "vacío". Mockeamos GET
 * /api/quotes/:id/echoes con fetch.
 */

type Echo = { id: string; entityName: string; text: string; source: string | null }

const ECHOES: Echo[] = [
  {
    id: 'q-2',
    entityName: 'Borges',
    text: 'El tiempo es la sustancia de la que estoy hecho.',
    source: 'Ficciones',
  },
]

function stubEchoesFetch(res: Echo[] | { status: number }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/echoes')) {
        if (Array.isArray(res)) {
          return new Response(JSON.stringify(res), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('boom', { status: res.status })
      }
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
}

beforeEach(() => {
  stubEchoesFetch(ECHOES)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<QuoteEchoesPanel />', () => {
  it('renderiza los ecos cuando la carga tiene éxito', async () => {
    renderWithProviders(<QuoteEchoesPanel quoteId="q-1" />)
    expect(await screen.findByText(/esto te recordó a/i)).toBeInTheDocument()
    expect(screen.getByText(/El tiempo es la sustancia/i)).toBeInTheDocument()
    // No debe haber estado de error en el happy-path.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('muestra estado de error (no silencio que parezca "vacío") cuando la carga falla', async () => {
    stubEchoesFetch({ status: 500 })
    renderWithProviders(<QuoteEchoesPanel quoteId="q-1" />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/no se pudieron cargar los ecos/i)
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
    // El eyebrow editorial ("esto te recordó a") NO debe aparecer ante un
    // fallo: el error no se confunde con marginalia.
    expect(screen.queryByText(/esto te recordó a/i)).not.toBeInTheDocument()
  })

  it('no renderiza nada cuando no hay ecos (vacío real, no error)', async () => {
    stubEchoesFetch([])
    const { container } = renderWithProviders(<QuoteEchoesPanel quoteId="q-1" />)
    // El empty real sigue siendo silencioso: ni error ni eyebrow.
    await waitFor(() =>
      expect(screen.queryByText(/esto te recordó a/i)).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })
})
