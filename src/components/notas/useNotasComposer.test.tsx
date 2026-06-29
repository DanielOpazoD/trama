import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useNotasComposer } from './useNotasComposer'

// Mockeamos las mutaciones y el toast: testeamos la LÓGICA de orquestación del
// composer (qué se llama, con qué args, qué feedback), no el stack de red. Cada
// mutate puede invocar sus callbacks (onSuccess/onError) según lo configuremos.
const mocks = vi.hoisted(() => ({
  createNote: vi.fn(),
  uploadAttachment: vi.fn(async () => {}),
  createRecorte: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('../../state', () => ({
  useCreateNote: () => ({ mutate: mocks.createNote, isPending: false }),
  useUploadNotasAttachment: () => ({
    mutateAsync: mocks.uploadAttachment,
    isPending: false,
  }),
  useCreateRecorte: () => ({ mutate: mocks.createRecorte, isPending: false }),
  useToast: () => ({ show: mocks.toast }),
}))

// compressImage usa canvas (no en happy-dom); passthrough.
vi.mock('../momentos/helpers', async (importActual) => {
  const actual = await importActual<typeof import('../momentos/helpers')>()
  return { ...actual, compressImage: vi.fn(async (f: File) => f) }
})
// El ref del textarea y el media query no aportan a la lógica que probamos.
vi.mock('../../hooks/useAutosizeTextarea', () => ({
  useAutosizeTextarea: () => ({ current: null }),
}))
vi.mock('../../hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => false,
}))

function dropEventWith(files: File[]) {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { files },
  } as unknown as React.DragEvent
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useNotasComposer', () => {
  it('guarda texto plano como nota (createNote con content + title)', () => {
    const { result } = renderHook(() => useNotasComposer())
    act(() => {
      result.current.setTitle('Mi título')
      result.current.setDraft('  una idea  ')
    })
    act(() => result.current.save())

    expect(mocks.createNote).toHaveBeenCalledTimes(1)
    expect(mocks.createNote.mock.calls[0]![0]).toEqual({
      content: 'una idea',
      title: 'Mi título',
    })
    expect(mocks.createRecorte).not.toHaveBeenCalled()
  })

  it('un enlace puro se detecta (isLinkDraft) y se guarda como recorte web', () => {
    const { result } = renderHook(() => useNotasComposer())
    act(() => result.current.setDraft('https://ejemplo.com/articulo'))
    expect(result.current.isLinkDraft).toBe(true)

    act(() => result.current.save())
    expect(mocks.createRecorte).toHaveBeenCalledTimes(1)
    expect(mocks.createRecorte.mock.calls[0]![0]).toMatchObject({
      kind: 'link',
      url: 'https://ejemplo.com/articulo',
    })
    expect(mocks.createNote).not.toHaveBeenCalled()
  })

  it('forceNote anula la heurística de enlace (guarda como nota)', () => {
    const { result } = renderHook(() => useNotasComposer())
    act(() => {
      result.current.setDraft('https://ejemplo.com')
      result.current.setForceNote(true)
    })
    expect(result.current.isLinkDraft).toBe(false)

    act(() => result.current.save())
    expect(mocks.createNote).toHaveBeenCalledTimes(1)
    expect(mocks.createRecorte).not.toHaveBeenCalled()
  })

  it('createNote con error muestra un toast (fix CodeRabbit: antes silencioso)', () => {
    mocks.createNote.mockImplementation((_vars, opts) => {
      opts?.onError?.(new Error('falló el guardado'))
    })
    const { result } = renderHook(() => useNotasComposer())
    act(() => result.current.setDraft('nota que falla'))
    act(() => result.current.save())

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'falló el guardado', tone: 'error' }),
    )
  })

  it('soltar un archivo no soportado avisa y previene el default (mejora propia)', () => {
    const { result } = renderHook(() => useNotasComposer())
    const pdf = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    const evt = dropEventWith([pdf])
    act(() => result.current.onComposerDrop(evt))

    expect(evt.preventDefault).toHaveBeenCalled() // no navega fuera
    expect(mocks.createRecorte).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Solo se pueden soltar imágenes o videos.' }),
    )
  })

  it('soltar una imagen la captura como recorte', async () => {
    const { result } = renderHook(() => useNotasComposer())
    const img = new File(['x'], 'foto.png', { type: 'image/png' })
    const evt = dropEventWith([img])
    await act(async () => {
      result.current.onComposerDrop(evt)
    })
    expect(evt.preventDefault).toHaveBeenCalled()
    // captureMediaFiles comprime (await) antes de crear el recorte.
    await waitFor(() => expect(mocks.createRecorte).toHaveBeenCalledTimes(1))
    expect(mocks.createRecorte.mock.calls[0]![0]).toMatchObject({ kind: 'image' })
  })

  it('composerActive refleja contenido o foco', () => {
    const { result } = renderHook(() => useNotasComposer())
    expect(result.current.composerActive).toBe(false)
    act(() => result.current.setDraft('algo'))
    expect(result.current.composerActive).toBe(true)
  })
})
