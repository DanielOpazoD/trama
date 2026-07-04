import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'
import type { World } from '../types/world'

const stateMocks = vi.hoisted(() => ({
  acknowledgeHealthAlerts: vi.fn(),
  useCountsQuery: vi.fn(),
  useHealthAlerts: vi.fn(),
  useMomentoShareInvitationsQuery: vi.fn(),
  useProactiveQuery: vi.fn(),
  useIsMobile: vi.fn(),
  isSectionVisible: vi.fn(),
}))

vi.mock('../state', () => ({
  acknowledgeHealthAlerts: stateMocks.acknowledgeHealthAlerts,
  useCountsQuery: stateMocks.useCountsQuery,
  useHealthAlerts: stateMocks.useHealthAlerts,
  useMomentoShareInvitationsQuery: stateMocks.useMomentoShareInvitationsQuery,
  useProactiveQuery: stateMocks.useProactiveQuery,
}))

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: stateMocks.useIsMobile,
}))

vi.mock('../hooks/useSectionVisibility', () => ({
  useSectionVisibility: () => ({
    isVisible: stateMocks.isSectionVisible,
    setVisible: () => {},
    showAll: () => {},
    visibleSections: {},
  }),
}))

vi.mock('./AIModeToggle', () => ({
  AIModeToggle: ({ collapsed }: { collapsed?: boolean }) => (
    <button type="button">modo IA {collapsed ? 'colapsado' : 'expandido'}</button>
  ),
}))

vi.mock('./Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('./WorldSwitcher', () => ({
  WorldSwitcher: ({
    world,
    collapsed,
    onChangeWorld,
  }: {
    world: World
    collapsed?: boolean
    onChangeWorld: (world: World) => void
  }) => (
    <button type="button" onClick={() => onChangeWorld('notas')}>
      mundo {world} {collapsed ? 'colapsado' : 'expandido'}
    </button>
  ),
}))

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const props: Parameters<typeof Sidebar>[0] = {
    view: 'inicio',
    onChangeView: vi.fn(),
    world: 'trama',
    onChangeWorld: vi.fn(),
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    offline: false,
    onOpenSettings: vi.fn(),
    onOpenPalette: vi.fn(),
    ...overrides,
  }

  render(<Sidebar {...props} />)
  return props
}

describe('<Sidebar />', () => {
  beforeEach(() => {
    stateMocks.acknowledgeHealthAlerts.mockReset()
    stateMocks.useCountsQuery.mockReset()
    stateMocks.useHealthAlerts.mockReset()
    stateMocks.useMomentoShareInvitationsQuery.mockReset()
    stateMocks.useProactiveQuery.mockReset()
    stateMocks.useIsMobile.mockReset()
    stateMocks.isSectionVisible.mockReset()

    stateMocks.useCountsQuery.mockReturnValue({
      data: { entities: 12, quotes: 7, momentos: 4 },
    })
    stateMocks.useHealthAlerts.mockReturnValue({
      alerts: [{ code: 'budget-high' }],
      count: 1,
      maxSeverity: 'warn',
    })
    stateMocks.useMomentoShareInvitationsQuery.mockReturnValue({ data: { items: [] } })
    stateMocks.useProactiveQuery.mockReturnValue({ data: [] })
    stateMocks.useIsMobile.mockReturnValue(false)
    stateMocks.isSectionVisible.mockReturnValue(true)
  })

  it('renderiza navegación expandida con grupos, contadores y sugerencias ocultas sin pendientes', async () => {
    const user = userEvent.setup()
    const props = renderSidebar({ view: 'entidades' })

    expect(screen.getByText('Catálogo')).toBeInTheDocument()
    expect(screen.getByText('Lentes')).toBeInTheDocument()
    expect(screen.getByText('Diálogo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entidades 12' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Citas 7' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Flujo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recortes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sugerencias/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Buscar (Ctrl K)' }))
    await user.click(screen.getByRole('button', { name: 'Twitter' }))
    await user.click(screen.getByRole('button', { name: /Configuración/i }))

    expect(props.onOpenPalette).toHaveBeenCalledOnce()
    expect(props.onChangeView).toHaveBeenCalledWith('twitter')
    expect(stateMocks.acknowledgeHealthAlerts).toHaveBeenCalledWith(['budget-high'])
    expect(props.onOpenSettings).toHaveBeenCalledOnce()
  })

  it('mantiene visible la vista activa aunque esté oculta por personalización', () => {
    stateMocks.isSectionVisible.mockImplementation((view: string) => view !== 'atlas')

    renderSidebar({ view: 'atlas' })

    expect(screen.getByRole('button', { name: 'Atlas' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('renderiza la versión colapsada con búsqueda, mundo, modo local y sugerencias pendientes', async () => {
    const user = userEvent.setup()
    stateMocks.useProactiveQuery.mockReturnValue({ data: [{ id: 'p1' }, { id: 'p2' }] })
    const props = renderSidebar({ collapsed: true, offline: true })

    expect(screen.getByRole('button', { name: 'Expandir sidebar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sugerencias 2' })).toBeInTheDocument()
    expect(screen.getByLabelText('Sin conexión al backend')).toBeInTheDocument()
    expect(screen.getByText(/mundo trama colapsado/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Configuración (1 alerta)' }))
    await user.click(screen.getByRole('button', { name: 'Sugerencias 2' }))

    expect(props.onOpenSettings).toHaveBeenCalledOnce()
    expect(props.onChangeView).toHaveBeenCalledWith('sugerencias')
  })

  it('en móvil pinta backdrop y lo usa para cerrar el menú', async () => {
    const user = userEvent.setup()
    stateMocks.useIsMobile.mockReturnValue(true)
    const props = renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Cerrar menú' }))

    expect(props.onToggleCollapsed).toHaveBeenCalledOnce()
  })

  it('pasa el cambio de mundo desde el conmutador', async () => {
    const user = userEvent.setup()
    const props = renderSidebar()

    await user.click(screen.getByRole('button', { name: /mundo trama expandido/i }))

    expect(props.onChangeWorld).toHaveBeenCalledWith('notas')
  })

  it('ajusta el ancho con el asa: arrastre, doble clic y teclado', async () => {
    const user = userEvent.setup()
    window.localStorage.removeItem('trama:sidebar-width')
    renderSidebar()

    const handle = screen.getByRole('separator', { name: /ajustar ancho/i })
    const aside = document.querySelector('aside') as HTMLElement
    expect(aside.style.width).toBe('256px')

    // Arrastre: pointerdown en el asa + move/up en window
    fireEvent.pointerDown(handle, { clientX: 256 })
    fireEvent.pointerUp(window, { clientX: 320 })
    expect(aside.style.width).toBe('320px')
    expect(window.localStorage.getItem('trama:sidebar-width')).toBe('320')

    // Teclado: flechas ±16 con clamp
    handle.focus()
    await user.keyboard('{ArrowRight}')
    expect(aside.style.width).toBe('336px')
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(aside.style.width).toBe('304px')

    // Doble clic restaura el default
    fireEvent.doubleClick(handle)
    expect(aside.style.width).toBe('256px')
    expect(window.localStorage.getItem('trama:sidebar-width')).toBe('256')
  })

  it('cancela el arrastre sin fugas cuando el gesto se interrumpe (pointercancel)', () => {
    window.localStorage.removeItem('trama:sidebar-width')
    renderSidebar()

    const handle = screen.getByRole('separator', { name: /ajustar ancho/i })
    const aside = document.querySelector('aside') as HTMLElement

    fireEvent.pointerDown(handle, { clientX: 256 })
    fireEvent(window, new Event('pointercancel'))
    expect(window.localStorage.getItem('trama:sidebar-width')).toBe('256')

    // Tras el cancel los listeners quedaron removidos: mover ya no redimensiona
    fireEvent.pointerMove(window, { clientX: 380 })
    expect(aside.style.width).toBe('256px')
  })

  it('muestra badge de invitaciones pendientes en Momentos', () => {
    stateMocks.useMomentoShareInvitationsQuery.mockReturnValue({
      data: { items: [{ id: 'inv1' }, { id: 'inv2' }] },
    })

    renderSidebar({ view: 'inicio' })

    expect(
      screen.getByRole('button', { name: /Momentos 4 2 invitaciones/i }),
    ).toBeInTheDocument()
  })

  it('tolera respuestas legacy sin items para invitaciones compartidas', () => {
    stateMocks.useMomentoShareInvitationsQuery.mockReturnValue({ data: [] })

    renderSidebar({ view: 'inicio' })

    expect(screen.getByRole('button', { name: 'Momentos 4' })).toBeInTheDocument()
  })
})
