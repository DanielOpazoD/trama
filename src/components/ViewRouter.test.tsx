import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ExtractionProposal } from '../types'
import { ViewRouter } from './ViewRouter'

vi.mock('./HomeView', () => ({
  HomeView: ({
    onNavigate,
    onSelectEntity,
  }: {
    onNavigate: (view: string) => void
    onSelectEntity: (id: string | null) => void
  }) => (
    <section>
      home mock
      <button onClick={() => onNavigate('citas')}>ir citas</button>
      <button onClick={() => onSelectEntity('e-home')}>seleccionar home</button>
    </section>
  ),
}))

vi.mock('./GraphView', () => ({
  default: ({
    selectedId,
    onSelect,
    onProposal,
  }: {
    selectedId: string | null
    onSelect: (id: string | null) => void
    onProposal: (text: string, proposal: ExtractionProposal) => void
  }) => (
    <section>
      grafo mock {selectedId}
      <button onClick={() => onSelect('e-graph')}>seleccionar grafo</button>
      <button onClick={() => onProposal('texto', {} as ExtractionProposal)}>
        proponer grafo
      </button>
    </section>
  ),
}))

vi.mock('./ChatView', () => ({
  ChatView: ({
    initialThreadId,
    onConsumedInitialThread,
  }: {
    initialThreadId: string | null
    onConsumedInitialThread: () => void
  }) => (
    <section>
      chat mock {initialThreadId}
      <button onClick={onConsumedInitialThread}>consumir thread</button>
    </section>
  ),
}))

vi.mock('./EntitiesWorkbench', () => ({
  EntitiesWorkbench: ({
    tab,
    onTabChange,
    onSelectEntity,
  }: {
    tab: 'listado' | 'vinculos'
    onTabChange: (tab: 'listado' | 'vinculos') => void
    onSelectEntity: (id: string | null) => void
  }) => (
    <section>
      entidades mock {tab}
      <button onClick={() => onTabChange('vinculos')}>tab vínculos</button>
      <button onClick={() => onSelectEntity('e-entities')}>seleccionar entidad</button>
    </section>
  ),
}))

vi.mock('./QuotesView', () => ({
  QuotesView: ({ onSelectEntity }: { onSelectEntity: (id: string | null) => void }) => (
    <section>
      citas mock
      <button onClick={() => onSelectEntity('e-quote')}>seleccionar cita</button>
    </section>
  ),
}))

vi.mock('./ListeningView', () => ({
  ListeningView: () => <section>escuchas mock</section>,
}))
vi.mock('./TwitterView', () => ({
  TwitterView: () => <section>twitter mock</section>,
}))
vi.mock('./MomentosView', () => ({
  MomentosView: () => <section>momentos mock</section>,
}))
vi.mock('./CronologiaView', () => ({
  CronologiaView: () => <section>cronología mock</section>,
}))
vi.mock('./AtlasView', () => ({
  AtlasView: () => <section>atlas mock</section>,
}))
vi.mock('./ProactiveView', () => ({
  ProactiveView: () => <section>sugerencias mock</section>,
}))
function renderRouter(
  view: Parameters<typeof ViewRouter>[0]['view'],
  overrides: Partial<Parameters<typeof ViewRouter>[0]> = {},
) {
  const props = {
    view,
    selectedEntityId: null,
    pendingChatThreadId: null,
    entitiesTab: 'listado' as const,
    onEntitiesTabChange: vi.fn(),
    onSelectEntity: vi.fn(),
    onChangeView: vi.fn(),
    onProposal: vi.fn(),
    onConsumedInitialThread: vi.fn(),
    ...overrides,
  }
  render(<ViewRouter {...props} />)
  return props
}

describe('<ViewRouter />', () => {
  it('renderiza inicio dentro del contenedor principal y propaga navegación', async () => {
    const user = userEvent.setup()
    const props = renderRouter('inicio')

    expect(screen.getByLabelText('Contenido principal')).toBeInTheDocument()
    expect(screen.getByText(/home mock/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ir citas' }))
    await user.click(screen.getByRole('button', { name: 'seleccionar home' }))

    expect(props.onChangeView).toHaveBeenCalledWith('citas')
    expect(props.onSelectEntity).toHaveBeenCalledWith('e-home')
  })

  it('renderiza grafo como vista full-canvas y propaga callbacks', async () => {
    const user = userEvent.setup()
    const props = renderRouter('grafo', { selectedEntityId: 'e1' })

    expect(screen.queryByLabelText('Contenido principal')).not.toBeInTheDocument()
    expect(await screen.findByText(/grafo mock e1/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'seleccionar grafo' }))
    await user.click(screen.getByRole('button', { name: 'proponer grafo' }))

    expect(props.onSelectEntity).toHaveBeenCalledWith('e-graph')
    expect(props.onProposal).toHaveBeenCalledWith('texto', {})
  })

  it('renderiza chat full-canvas con thread inicial', async () => {
    const user = userEvent.setup()
    const props = renderRouter('chat', { pendingChatThreadId: 'thread-1' })

    expect(screen.queryByLabelText('Contenido principal')).not.toBeInTheDocument()
    expect(await screen.findByText(/chat mock thread-1/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'consumir thread' }))

    expect(props.onConsumedInitialThread).toHaveBeenCalledOnce()
  })

  it('inyecta estado y callbacks a Entidades', async () => {
    const user = userEvent.setup()
    const props = renderRouter('entidades', { entitiesTab: 'listado' })

    expect(await screen.findByText(/entidades mock listado/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'tab vínculos' }))
    await user.click(screen.getByRole('button', { name: 'seleccionar entidad' }))

    expect(props.onEntitiesTabChange).toHaveBeenCalledWith('vinculos')
    expect(props.onSelectEntity).toHaveBeenCalledWith('e-entities')
  })
})
