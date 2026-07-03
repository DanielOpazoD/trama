import { act, renderHook } from '@testing-library/react'
import type { Dispatch, SetStateAction } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addPdfSource,
  emptyDoc,
  type PdfDoc,
} from '../../../../lib/pdfStudio/model/model'
import type { History } from '../../../../lib/pdfStudio/model/history'
import { usePdfStudioWorkspace } from './usePdfStudioWorkspace'

const mocks = vi.hoisted(() => ({
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
  listSavedDocs: vi.fn(),
  listSavedFolders: vi.fn(),
  toastShow: vi.fn(),
}))

vi.mock('../../../../lib/pdfStudio/render/persistence', () => ({
  loadDraft: mocks.loadDraft,
  saveDraft: mocks.saveDraft,
  deleteSavedDoc: vi.fn(),
  deleteSavedFolder: vi.fn(),
  listSavedFolders: mocks.listSavedFolders,
  listSavedDocs: mocks.listSavedDocs,
  putSavedFolder: vi.fn(),
  putSavedDoc: vi.fn(),
}))

vi.mock('../../../../lib/clientIdentity', () => ({
  useCurrentClientUserId: () => 'test-user',
}))

vi.mock('../../../../state', () => ({
  useToast: () => ({ show: mocks.toastShow }),
}))

function pdfDoc(pageCount: number): PdfDoc {
  return addPdfSource(
    emptyDoc(),
    new File(['%PDF-1.4'], `doc-${pageCount}.pdf`, { type: 'application/pdf' }),
    pageCount,
  )
}

function renderWorkspace(doc: PdfDoc) {
  const setHistory = vi.fn() as unknown as Dispatch<SetStateAction<History<PdfDoc>>>
  return renderHook(
    ({ currentDoc }) =>
      usePdfStudioWorkspace({
        clearSelection: vi.fn(),
        doc: currentDoc,
        setHistory,
      }),
    { initialProps: { currentDoc: doc } },
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

async function flushAsyncEffects() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('usePdfStudioWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mocks.loadDraft.mockResolvedValue(null)
    mocks.listSavedDocs.mockResolvedValue([])
    mocks.listSavedFolders.mockResolvedValue([])
    mocks.saveDraft.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mantiene idle el autoguardado de documentos vacios', async () => {
    const hook = renderWorkspace(emptyDoc())

    await flushAsyncEffects()
    expect(mocks.loadDraft).toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(mocks.saveDraft).not.toHaveBeenCalled()
    expect(hook.result.current.autosaveState).toEqual({ kind: 'idle', pages: 0 })
  })

  it('ignora completaciones antiguas cuando empieza un autoguardado mas nuevo', async () => {
    const firstSave = deferred<boolean>()
    const secondSave = deferred<boolean>()
    mocks.saveDraft
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise)

    const hook = renderWorkspace(pdfDoc(1))
    await flushAsyncEffects()
    expect(mocks.loadDraft).toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(hook.result.current.autosaveState).toEqual({ kind: 'saving', pages: 1 })

    hook.rerender({ currentDoc: pdfDoc(2) })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(hook.result.current.autosaveState).toEqual({ kind: 'saving', pages: 2 })

    await act(async () => {
      firstSave.resolve(true)
      await firstSave.promise
    })

    expect(hook.result.current.autosaveState).toEqual({ kind: 'saving', pages: 2 })
  })

  it('autosaveSnapshot protege un snapshot puntual pasando por el sanitizador', async () => {
    const hook = renderWorkspace(emptyDoc())
    await flushAsyncEffects()

    act(() => {
      hook.result.current.setDraftSanitizer((draft) => ({
        ...draft,
        title: 'sanitizado',
      }))
    })
    const snapshot = { ...pdfDoc(1), title: 'ediciones del editor' }
    await act(async () => {
      hook.result.current.autosaveSnapshot(snapshot)
      await Promise.resolve()
    })

    expect(mocks.saveDraft).toHaveBeenCalledWith(
      'test-user',
      expect.objectContaining({ title: 'sanitizado' }),
      [],
    )
    expect(hook.result.current.autosaveState).toMatchObject({ kind: 'saved', pages: 1 })
  })

  it('autosaveSnapshot con documento vacío vuelve a idle sin guardar', async () => {
    const hook = renderWorkspace(emptyDoc())
    await flushAsyncEffects()

    await act(async () => {
      hook.result.current.autosaveSnapshot(emptyDoc())
      await Promise.resolve()
    })

    expect(mocks.saveDraft).not.toHaveBeenCalled()
    expect(hook.result.current.autosaveState).toEqual({ kind: 'idle', pages: 0 })
  })
})
