import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { QuoteCard } from './QuoteCard'
import type { Quote } from '../types'
import { renderWithProviders } from '../test-utils'

/**
 * Smoke tests para QuoteCard — verifica que el componente renderiza
 * sin crashear con datos típicos y reacciona a las interacciones core
 * (entrar a modo edición, ver atribución, mostrar reflexión).
 */

const QUOTE: Quote = {
  id: 'q-1',
  entityId: 'e-borges',
  text: 'El tiempo es la sustancia de la que estoy hecho.',
  source: 'Otras inquisiciones',
  linkedQuoteIds: [],
  origin: { kind: 'manual' },
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

function entitiesResponse(body: unknown) {
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
        return entitiesResponse([
          {
            id: 'e-borges',
            name: 'Borges',
            type: 'escritor',
            origin: { kind: 'manual' },
          },
        ])
      }
      return entitiesResponse({})
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<QuoteCard />', () => {
  it('renders the quote text + source', () => {
    renderWithProviders(<QuoteCard quote={QUOTE} />)
    expect(screen.getByText(/El tiempo es la sustancia/)).toBeInTheDocument()
    expect(screen.getByText(/Otras inquisiciones/)).toBeInTheDocument()
  })

  it('shows AI source tag when origin is AI', () => {
    const aiQuote: Quote = {
      ...QUOTE,
      origin: { kind: 'ai', provider: 'openai', model: 'gpt-4' },
    }
    const { container } = renderWithProviders(<QuoteCard quote={aiQuote} />)
    // SparkleIcon SVG aparece cuando origin.kind === 'ai'
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('displays saved userReflection', () => {
    const withReflection: Quote = {
      ...QUOTE,
      userReflection: 'mi anotación al margen',
    }
    renderWithProviders(<QuoteCard quote={withReflection} />)
    expect(screen.getByText(/mi anotación al margen/)).toBeInTheDocument()
  })

  it('displays saved aiReflection with provider label', () => {
    const withAiRefl: Quote = {
      ...QUOTE,
      aiReflection: 'una interpretación literaria del tiempo',
      aiReflectionProvider: 'openai',
      aiReflectionModel: 'gpt-4',
      aiReflectionAt: '2024-01-02T00:00:00Z',
    } as Quote
    renderWithProviders(<QuoteCard quote={withAiRefl} />)
    expect(screen.getByText(/interpretación de la IA/i)).toBeInTheDocument()
    expect(
      screen.getByText(/una interpretación literaria del tiempo/),
    ).toBeInTheDocument()
  })

  it('opens the AI reflection request button when no reflection saved', () => {
    renderWithProviders(<QuoteCard quote={QUOTE} />)
    expect(
      screen.getByRole('button', { name: /pedir interpretación/i }),
    ).toBeInTheDocument()
  })

  it('renders linkedQuotes chips when provided', () => {
    const linked: Quote = {
      ...QUOTE,
      id: 'q-2',
      text: 'cita relacionada',
    }
    renderWithProviders(<QuoteCard quote={QUOTE} linkedQuotes={[linked]} />)
    expect(screen.getByText(/cita relacionada/)).toBeInTheDocument()
  })

  it('clicking "tu reflexión" toggles the user reflection editor', () => {
    renderWithProviders(<QuoteCard quote={QUOTE} />)
    const toggleButton = screen.getByRole('button', {
      name: /\+ reflexión|tu reflexión/i,
    })
    fireEvent.click(toggleButton)
    // Después del click debe aparecer un textarea
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })
})
