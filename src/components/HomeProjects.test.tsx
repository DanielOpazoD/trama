import { screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { renderWithProviders } from '../test-utils'
import { HomeProjects } from './HomeProjects'

const mocks = vi.hoisted(() => ({ data: [] as unknown[] }))

vi.mock('../state', async () => {
  const actual = await vi.importActual<typeof import('../state')>('../state')
  return { ...actual, useReadingTablesQuery: () => ({ data: mocks.data }) }
})

const project = (id: string, title: string, status: string) => ({
  id,
  title,
  materialIds: [],
  draftMarkdown: null,
  status,
  createdAt: '2026-06-13T00:00:00.000Z',
  updatedAt: '2026-06-13T00:00:00.000Z',
})

describe('<HomeProjects />', () => {
  it('no renderiza nada sin proyectos en curso', () => {
    mocks.data = []
    const { container } = renderWithProviders(<HomeProjects />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lista proyectos activos con deep-link y oculta los cerrados', () => {
    mocks.data = [
      project('p1', 'Ensayo abierto', 'borrador'),
      project('p2', 'Ya cerrado', 'cerrado'),
    ]
    renderWithProviders(<HomeProjects />)
    const link = screen.getByRole('link', { name: /Ensayo abierto/i })
    expect(link).toHaveAttribute('href', '/?world=notas&section=notas')
    expect(screen.queryByText('Ya cerrado')).not.toBeInTheDocument()
  })
})
