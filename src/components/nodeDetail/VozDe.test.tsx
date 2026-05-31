import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entity, Quote } from '../../types'
import { VozDe } from './VozDe'

const stateMocks = vi.hoisted(() => ({
  useQuotesQuery: vi.fn(),
  useVoiceOfEntity: vi.fn(),
  useToast: vi.fn(),
}))

vi.mock('../../state', () => stateMocks)

const ENTITY: Entity = {
  id: 'ent-voice',
  type: 'escritor',
  name: 'Alejandra Pizarnik',
  year: 1936,
  origin: { kind: 'manual' },
  createdAt: '2026-05-31T00:00:00.000Z',
  updatedAt: '2026-05-31T00:00:00.000Z',
}

function quotesFor(entityId: string, count: number): Quote[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `quote-${index}`,
    entityId,
    text: `Cita ${index}`,
    source: undefined,
    linkedQuoteIds: [],
    origin: { kind: 'manual' },
    createdAt: '2026-05-31T00:00:00.000Z',
    updatedAt: '2026-05-31T00:00:00.000Z',
  }))
}

describe('<VozDe />', () => {
  beforeEach(() => {
    stateMocks.useQuotesQuery.mockReturnValue({ data: [] })
    stateMocks.useVoiceOfEntity.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    })
    stateMocks.useToast.mockReturnValue({ show: vi.fn() })
  })

  it('no renderiza nada cuando la entidad tiene menos de cinco citas', () => {
    stateMocks.useQuotesQuery.mockReturnValue({ data: quotesFor(ENTITY.id, 4) })

    const { container } = render(<VozDe entity={ENTITY} />)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('abre la lectura, pregunta con texto trimmeado y muestra la respuesta IA', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      voice: 'Diría que la noche también aprende a mirar.',
      provider: 'openai',
      model: 'gpt-test',
    })
    stateMocks.useQuotesQuery.mockReturnValue({ data: quotesFor(ENTITY.id, 5) })
    stateMocks.useVoiceOfEntity.mockReturnValue({ mutateAsync, isPending: false })

    render(<VozDe entity={ENTITY} />)

    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: /qué diría Alejandra Pizarnik/i }),
    )

    expect(
      screen.getByRole('heading', { name: /voz de Alejandra Pizarnik/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /preguntar/i })).toBeDisabled()

    await user.type(screen.getByPlaceholderText('¿Sobre qué tema?'), '  la noche  ')
    await user.click(screen.getByRole('button', { name: /preguntar/i }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        id: ENTITY.id,
        question: 'la noche',
      })
    })
    expect(
      await screen.findByText('Diría que la noche también aprende a mirar.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/lectura activa · no es Alejandra Pizarnik/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /generado por openai · gpt-test/i }),
    ).toBeInTheDocument()
  })

  it('usa el fallback "esta voz" para nombres largos y cerrar limpia pregunta/respuesta', async () => {
    const longEntity: Entity = {
      ...ENTITY,
      name: 'Una voz con un nombre demasiado extenso para el botón',
    }
    stateMocks.useQuotesQuery.mockReturnValue({ data: quotesFor(longEntity.id, 5) })
    stateMocks.useVoiceOfEntity.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        voice: 'Respuesta temporal.',
        provider: 'openai',
        model: 'gpt-test',
      }),
      isPending: false,
    })

    render(<VozDe entity={longEntity} />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /qué diría esta voz/i }))
    await user.type(screen.getByPlaceholderText('¿Sobre qué tema?'), 'memoria')
    await user.click(screen.getByRole('button', { name: /preguntar/i }))
    expect(await screen.findByText('Respuesta temporal.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /cerrar/i }))
    await user.click(screen.getByRole('button', { name: /qué diría esta voz/i }))

    expect(screen.getByPlaceholderText('¿Sobre qué tema?')).toHaveValue('')
    expect(screen.queryByText('Respuesta temporal.')).not.toBeInTheDocument()
  })

  it('muestra toast de error y conserva el formulario abierto si falla la voz', async () => {
    const show = vi.fn()
    const mutateAsync = vi.fn().mockRejectedValue(new Error('No alcanzó el archivo'))
    stateMocks.useQuotesQuery.mockReturnValue({ data: quotesFor(ENTITY.id, 5) })
    stateMocks.useVoiceOfEntity.mockReturnValue({ mutateAsync, isPending: false })
    stateMocks.useToast.mockReturnValue({ show })

    render(<VozDe entity={ENTITY} />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /qué diría/i }))
    await user.type(screen.getByPlaceholderText('¿Sobre qué tema?'), 'silencio')
    await user.click(screen.getByRole('button', { name: /preguntar/i }))

    await waitFor(() => {
      expect(show).toHaveBeenCalledWith({
        message: 'No alcanzó el archivo',
        tone: 'error',
      })
    })
    expect(
      screen.getByRole('heading', { name: /voz de Alejandra Pizarnik/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/lectura activa/i)).not.toBeInTheDocument()
  })
})
