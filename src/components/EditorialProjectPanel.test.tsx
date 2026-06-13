import { fireEvent, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders } from '../test-utils'
import { EditorialProjectPanel } from './EditorialProjectPanel'
import type { ReadingTable } from '../api'

const mocks = vi.hoisted(() => ({
  updateMutate: vi.fn(),
  addMomentoMutate: vi.fn(),
}))

vi.mock('../state', async () => {
  const actual = await vi.importActual<typeof import('../state')>('../state')
  return {
    ...actual,
    useUpdateReadingTable: () => ({ mutate: mocks.updateMutate }),
    useAddMomento: () => ({ mutate: mocks.addMomentoMutate, isPending: false }),
  }
})

const project: ReadingTable = {
  id: 'p1',
  title: 'Ensayo sobre la memoria',
  materialIds: ['recorte:a'],
  draftMarkdown: '# Tesis',
  status: 'borrador',
  createdAt: '2026-06-13T12:00:00.000Z',
  updatedAt: '2026-06-13T12:00:00.000Z',
}

describe('<EditorialProjectPanel />', () => {
  beforeEach(() => {
    mocks.updateMutate.mockClear()
    mocks.addMomentoMutate.mockClear()
  })

  it('guarda el borrador editado (PATCH draftMarkdown)', () => {
    renderWithProviders(<EditorialProjectPanel project={project} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Borrador del proyecto'), {
      target: { value: '# Reescrito' },
    })
    fireEvent.click(screen.getByRole('button', { name: /guardar borrador/i }))
    expect(mocks.updateMutate).toHaveBeenCalledWith({
      id: 'p1',
      patch: { draftMarkdown: '# Reescrito' },
    })
  })

  it('cambia el estado del proyecto', () => {
    renderWithProviders(<EditorialProjectPanel project={project} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^revisando$/i }))
    expect(mocks.updateMutate).toHaveBeenCalledWith({
      id: 'p1',
      patch: { status: 'revisando' },
    })
  })

  it('publica el proyecto como Momento (kind nota) y lo cierra', () => {
    renderWithProviders(<EditorialProjectPanel project={project} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /publicar como momento/i }))
    expect(mocks.addMomentoMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'nota',
        payload: { bodyText: '# Tesis' },
        note: 'Ensayo sobre la memoria',
      }),
    )
    expect(mocks.updateMutate).toHaveBeenCalledWith({
      id: 'p1',
      patch: { status: 'cerrado' },
    })
  })
})
