import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EntitiesWorkbench } from './EntitiesWorkbench'

const viewMocks = vi.hoisted(() => ({
  entitiesView: vi.fn(),
  relationshipsView: vi.fn(),
}))

vi.mock('./EntitiesView', () => ({
  EntitiesView: (props: unknown) => {
    viewMocks.entitiesView(props)
    return <div>vista listado</div>
  },
}))

vi.mock('./RelationshipsView', () => ({
  RelationshipsView: (props: unknown) => {
    viewMocks.relationshipsView(props)
    return <div>vista vínculos</div>
  },
}))

describe('<EntitiesWorkbench />', () => {
  beforeEach(() => {
    viewMocks.entitiesView.mockClear()
    viewMocks.relationshipsView.mockClear()
  })

  it('renderiza la vista de listado y propaga onSelectEntity', () => {
    const onSelectEntity = vi.fn()

    render(
      <EntitiesWorkbench
        tab="listado"
        onTabChange={vi.fn()}
        onSelectEntity={onSelectEntity}
      />,
    )

    expect(screen.getByText('vista listado')).toBeInTheDocument()
    expect(screen.queryByText('vista vínculos')).not.toBeInTheDocument()
    expect(viewMocks.entitiesView).toHaveBeenCalledWith({ onSelectEntity })
    expect(viewMocks.relationshipsView).not.toHaveBeenCalled()
  })

  it('renderiza la vista de vínculos y propaga callbacks relevantes', () => {
    const onSelectEntity = vi.fn()
    const onProposal = vi.fn()

    render(
      <EntitiesWorkbench
        tab="vinculos"
        onTabChange={vi.fn()}
        onSelectEntity={onSelectEntity}
        onProposal={onProposal}
      />,
    )

    expect(screen.getByText('vista vínculos')).toBeInTheDocument()
    expect(screen.queryByText('vista listado')).not.toBeInTheDocument()
    expect(viewMocks.relationshipsView).toHaveBeenCalledWith({
      onSelectEntity,
      onProposal,
    })
    expect(viewMocks.entitiesView).not.toHaveBeenCalled()
  })
})
