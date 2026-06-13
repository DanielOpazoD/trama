import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test-utils'
import { KnowledgeWorkflowView } from './KnowledgeWorkflowView'

const stateMocks = vi.hoisted(() => ({
  useRecortesQuery: vi.fn(),
  useProactiveQuery: vi.fn(),
  useNotesQuery: vi.fn(),
  usePendingTasks: vi.fn(),
}))

vi.mock('../state', async () => {
  const actual = await vi.importActual<typeof import('../state')>('../state')
  return {
    ...actual,
    useRecortesQuery: stateMocks.useRecortesQuery,
    useProactiveQuery: stateMocks.useProactiveQuery,
    useNotesQuery: stateMocks.useNotesQuery,
    usePendingTasks: stateMocks.usePendingTasks,
  }
})

function installData({
  recortes = [
    {
      id: 'r1',
      status: 'pending',
      text: 'La memoria es un taller.',
      sourceTitle: 'El taller',
      sourceAuthor: 'Otra Parte',
      sourceUrl: 'https://example.com/taller',
      captureMode: 'citation',
      note: 'conecta con Borges',
      createdAt: '2026-06-12T10:00:00Z',
      updatedAt: '2026-06-12T10:00:00Z',
    },
  ],
  suggestions = [
    {
      id: 's1',
      kind: 'relationship',
      payload: {
        fromName: 'Borges',
        toName: 'Ficciones',
        type: 'escribió',
        reason: 'Aparecen juntos varias veces.',
      },
      status: 'pending',
      provider: 'openai',
      model: 'gpt-test',
      createdAt: '2026-06-12T11:00:00Z',
      statusChangedAt: null,
    },
  ],
  notes = [],
  tasks = [],
}: {
  recortes?: unknown[]
  suggestions?: unknown[]
  notes?: unknown[]
  tasks?: unknown[]
} = {}) {
  stateMocks.useRecortesQuery.mockReturnValue({ data: recortes, isLoading: false })
  stateMocks.useProactiveQuery.mockReturnValue({ data: suggestions, isLoading: false })
  stateMocks.useNotesQuery.mockReturnValue({ data: notes, isLoading: false })
  stateMocks.usePendingTasks.mockReturnValue({ data: tasks, isLoading: false })
}

describe('<KnowledgeWorkflowView />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    installData()
  })

  it('muestra el inbox de conocimiento con recortes y sugerencias pendientes', () => {
    renderWithProviders(<KnowledgeWorkflowView />)

    expect(screen.getByRole('heading', { name: 'Flujo' })).toBeInTheDocument()
    expect(screen.getByText('Inbox de conocimiento')).toBeInTheDocument()
    expect(screen.getByText('El taller')).toBeInTheDocument()
    expect(screen.getByText(/Relación sugerida: Borges → Ficciones/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /añadir a mesa/i })).toHaveLength(2)
  })

  it('muestra estado vacío cuando no hay materiales pendientes', () => {
    installData({ recortes: [], suggestions: [], notes: [], tasks: [] })

    renderWithProviders(<KnowledgeWorkflowView />)

    expect(screen.getByText(/Nada urgente para procesar/i)).toBeInTheDocument()
  })

  it('añade materiales a la mesa de lectura y permite quitarlos', () => {
    renderWithProviders(<KnowledgeWorkflowView />)

    const workbench = screen.getByLabelText('Mesa de lectura')
    expect(within(workbench).getByText(/Selecciona materiales/i)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /añadir a mesa/i })[0])
    expect(
      within(workbench).getByText(/Relación sugerida: Borges → Ficciones/i),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /añadido/i })[0]).toBeDisabled()

    fireEvent.click(within(workbench).getByRole('button', { name: /quitar/i }))
    expect(within(workbench).getByText(/Selecciona materiales/i)).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /añadir a mesa/i })[0])
    fireEvent.click(within(workbench).getByRole('button', { name: /vaciar mesa/i }))
    expect(within(workbench).getByText(/Selecciona materiales/i)).toBeInTheDocument()
  })

  it('genera una propuesta narrativa desde los materiales seleccionados', () => {
    renderWithProviders(<KnowledgeWorkflowView />)

    const addButtons = screen.getAllByRole('button', { name: /añadir a mesa/i })
    fireEvent.click(addButtons[0])
    fireEvent.click(addButtons[1])

    expect(screen.getByText('Propuesta narrativa')).toBeInTheDocument()
    expect(screen.getByText('Tesis provisional')).toBeInTheDocument()
    expect(
      screen.getByText(/Explorar cómo Relación sugerida: Borges → Ficciones/i),
    ).toBeInTheDocument()
    expect(screen.getByText('Huecos a revisar')).toBeInTheDocument()
  })
})
