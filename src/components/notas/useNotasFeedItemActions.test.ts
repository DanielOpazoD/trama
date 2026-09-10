import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Note } from '../../api'
import { useNotasFeedItemActions } from './useNotasFeedItemActions'

const m = vi.hoisted(() => ({
  toastShow: vi.fn(),
  updateNote: { mutate: vi.fn(), isPending: false },
  deleteNote: { mutate: vi.fn(), isPending: false },
  promoteNote: {
    mutate: vi.fn(),
    isPending: false,
    variables: undefined as string | undefined,
  },
  updateRecorte: { mutate: vi.fn() },
  deleteRecorte: { mutate: vi.fn() },
}))

vi.mock('../../state', () => ({
  useToast: () => ({ show: m.toastShow }),
  useUpdateNote: () => m.updateNote,
  useDeleteNote: () => m.deleteNote,
  usePromoteNote: () => m.promoteNote,
  useUpdateRecorte: () => m.updateRecorte,
  useDeleteRecorte: () => m.deleteRecorte,
}))

describe('useNotasFeedItemActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.updateNote.isPending = false
    m.deleteNote.isPending = false
    m.promoteNote.isPending = false
    m.promoteNote.variables = undefined
  })

  it('cada acción manda a su mutación el cambio exacto', () => {
    const { result } = renderHook(() => useNotasFeedItemActions())

    result.current.toggleNotePin({ id: 'n1', pinned: true } as Note)
    result.current.editNote('n2', { title: 'nuevo' })
    expect(m.updateNote.mutate.mock.calls).toEqual([
      [{ id: 'n1', patch: { pinned: false } }],
      [{ id: 'n2', patch: { title: 'nuevo' } }],
    ])

    result.current.archiveRecorte('r1')
    result.current.restoreRecorte('r2')
    expect(m.updateRecorte.mutate.mock.calls).toEqual([
      [{ id: 'r1', patch: { status: 'archived' } }],
      [{ id: 'r2', patch: { status: 'pending' } }],
    ])

    result.current.deleteNote('n3')
    result.current.deleteRecorte('r3')
    expect(m.deleteNote.mutate).toHaveBeenCalledWith('n3')
    expect(m.deleteRecorte.mutate).toHaveBeenCalledWith('r3')
  })

  it('promover avisa el éxito y el motivo del fallo', () => {
    const { result } = renderHook(() => useNotasFeedItemActions())

    result.current.promoteNote('n1')
    const [id, opciones] = m.promoteNote.mutate.mock.calls[0]!
    expect(id).toBe('n1')
    opciones.onSuccess()
    opciones.onError(new Error('sin permiso'))
    opciones.onError('algo raro')

    expect(m.toastShow.mock.calls).toEqual([
      [{ message: 'Nota promovida a Momento.', tone: 'success' }],
      [{ message: 'sin permiso', tone: 'error' }],
      [{ message: 'No se pudo promover', tone: 'error' }],
    ])
  })

  it('«ocupado» y «promoviendo» reflejan las mutaciones en curso', () => {
    m.deleteNote.isPending = true
    m.promoteNote.isPending = true
    m.promoteNote.variables = 'n9'

    const { result } = renderHook(() => useNotasFeedItemActions())

    expect(result.current.noteBusy).toBe(true)
    expect(result.current.promotingNoteId).toBe('n9')
  })
})
