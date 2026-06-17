import { describe, it, expect, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useMutation } from '@tanstack/react-query'
import { TopBar } from './TopBar'
import { renderWithProviders } from '../test-utils'

describe('<TopBar />', () => {
  it('muestra título y subtítulo de la vista activa', () => {
    renderWithProviders(<TopBar view="entidades" />)
    expect(screen.getByText('Entidades')).toBeInTheDocument()
    expect(
      screen.getByText(/catálogo de personas, obras y conceptos/i),
    ).toBeInTheDocument()
  })

  it.each([
    ['entidades', 'catálogo de personas, obras y conceptos'],
    ['citas', 'catálogo de fragmentos guardados'],
    ['momentos', 'catálogo temporal de notas y escenas'],
    ['grafo', 'lente de relaciones entre entidades'],
    ['cronologia', 'lente temporal de tu archivo'],
    ['atlas', 'lente de constelaciones temáticas'],
  ])('orienta %s como catálogo o lente', (view, subtitle) => {
    renderWithProviders(<TopBar view={view as never} />)
    expect(screen.getByText(subtitle)).toBeInTheDocument()
  })

  it.each([
    ['inicio', 'Inicio'],
    ['grafo', 'Grafo'],
    ['entidades', 'Entidades'],
    ['citas', 'Citas'],
    ['momentos', 'Momentos'],
    ['escuchas', 'Escuchas'],
    ['chat', 'Chat'],
    ['sugerencias', 'Sugerencias'],
  ])('cada ViewMode tiene su título: %s → %s', (view, expectedTitle) => {
    renderWithProviders(<TopBar view={view as never} />)
    expect(screen.getByText(expectedTitle)).toBeInTheDocument()
  })

  it('NO renderiza la pill "Buscar" — vive en el sidebar (ρ-struct)', () => {
    // ρ-struct: el botón "Buscar" se movió al sidebar para liberar el
    // TopBar de su rol de "barra de búsqueda" y dejarlo solo con
    // título + tabs contextuales + status.
    renderWithProviders(<TopBar view="inicio" />)
    expect(screen.queryByLabelText(/^Buscar/)).toBeNull()
  })

  it('renderiza tabs contextuales cuando se pasan en tabs prop', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <TopBar
        view="entidades"
        tabs={{
          items: [
            { value: 'listado', label: 'Listado' },
            { value: 'vinculos', label: 'Vínculos' },
          ],
          active: 'listado',
          onChange,
        }}
      />,
    )
    const listado = screen.getByRole('tab', { name: 'Listado' })
    const vinculos = screen.getByRole('tab', { name: 'Vínculos' })
    expect(listado).toHaveAttribute('aria-selected', 'true')
    expect(vinculos).toHaveAttribute('aria-selected', 'false')
    const user = userEvent.setup()
    await user.click(vinculos)
    expect(onChange).toHaveBeenCalledWith('vinculos')
  })

  it('oculta tabs cuando hay un breadcrumb activo (contexto manda)', () => {
    renderWithProviders(
      <TopBar
        view="entidades"
        breadcrumb={{ label: 'Hermann Hesse' }}
        tabs={{
          items: [
            { value: 'listado', label: 'Listado' },
            { value: 'vinculos', label: 'Vínculos' },
          ],
          active: 'listado',
          onChange: vi.fn(),
        }}
      />,
    )
    // El breadcrumb se renderea, las tabs no
    expect(screen.getByText('Hermann Hesse')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Listado' })).toBeNull()
  })

  it('renderiza children opcionales en el slot actions', () => {
    renderWithProviders(<TopBar view="inicio" actions={<button>Acción custom</button>} />)
    expect(screen.getByRole('button', { name: 'Acción custom' })).toBeInTheDocument()
  })

  it('muestra status pill "guardando…" cuando hay una mutation en flight', async () => {
    function MutationHarness() {
      const m = useMutation({
        mutationFn: () => new Promise(() => {}),
      })
      return (
        <>
          <TopBar view="inicio" />
          <button onClick={() => m.mutate(undefined)}>fire</button>
        </>
      )
    }
    renderWithProviders(<MutationHarness />)
    expect(screen.queryByText(/guardando…/i)).toBeNull()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'fire' }))
    // Tras disparar la mutation la pill aparece.
    expect(screen.getByText(/guardando…/i)).toBeInTheDocument()
  })

  it('muestra "sin conexión" cuando offline === true', () => {
    renderWithProviders(<TopBar view="inicio" />, { offline: true })
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument()
  })

  it('NO muestra pill de estado cuando idle y online', () => {
    renderWithProviders(<TopBar view="inicio" />)
    expect(screen.queryByText(/guardando|guardado|sin conexión/i)).toBeNull()
  })

  it('muestra "guardado" tras una mutation que se completa exitosamente', async () => {
    let resolveFn: (() => void) | null = null
    function MutationHarness() {
      const m = useMutation({
        mutationFn: () =>
          new Promise<void>((resolve) => {
            resolveFn = () => resolve()
          }),
      })
      return (
        <>
          <TopBar view="inicio" />
          <button onClick={() => m.mutate(undefined)}>fire</button>
        </>
      )
    }
    renderWithProviders(<MutationHarness />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'fire' }))
    expect(screen.getByText(/guardando…/i)).toBeInTheDocument()

    // Resolve the mutation
    await act(async () => {
      resolveFn!()
    })

    // El estado "saved" no es síncrono — TanStack tarda en marcar isMutating=0
    // y luego el useEffect del useGlobalStatus levanta showSaved. waitFor
    // tolera el delay sin hardcodear un sleep arbitrario.
    await waitFor(() => {
      expect(screen.queryByText(/guardando…/i)).toBeNull()
    })
    expect(screen.getByText(/^guardado$/i)).toBeInTheDocument()
  })
})
