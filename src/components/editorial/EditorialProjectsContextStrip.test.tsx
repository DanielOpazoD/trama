import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test-utils'
import { EditorialProjectsContextStrip } from './EditorialProjectsContextStrip'

const mocks = vi.hoisted(() => ({ projects: [] as unknown[] }))

vi.mock('../../state', async () => {
  const actual = await vi.importActual<typeof import('../../state')>('../../state')
  return { ...actual, useReadingTablesQuery: () => ({ data: mocks.projects }) }
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

describe('<EditorialProjectsContextStrip />', () => {
  beforeEach(() => {
    mocks.projects = []
  })

  it('no renderiza nada sin proyectos editoriales activos', () => {
    mocks.projects = [project('p-closed', 'Cerrado', 'cerrado')]

    const { container } = renderWithProviders(<EditorialProjectsContextStrip />)

    expect(container).toBeEmptyDOMElement()
  })

  it('enlaza proyectos abiertos hacia Recortes > Mesa', () => {
    mocks.projects = [
      project('p1', 'Ensayo abierto', 'borrador'),
      project('p2', 'Proyecto cerrado', 'cerrado'),
    ]

    renderWithProviders(<EditorialProjectsContextStrip />)

    expect(screen.getByText('Materiales relacionados')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Ensayo abierto/i })
    expect(link).toHaveAttribute(
      'href',
      '/?world=notas&section=bandeja&tab=mesa&project=p1',
    )
    expect(screen.queryByText('Proyecto cerrado')).not.toBeInTheDocument()
  })
})
