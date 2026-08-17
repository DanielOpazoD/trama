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
  deletePdfStudioSavedPdf: vi.fn(async () => {}),
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
  savedTemplateStatus: (saved: { status?: 'draft' | 'ready' }) => saved.status ?? 'ready',
}))

vi.mock('../../../../api/pdfStudioSavedPdfs', () => ({
  deletePdfStudioSavedPdf: mocks.deletePdfStudioSavedPdf,
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

  it('updateSavedMeta actualiza y persiste descripción, tags y estado', async () => {
    const putSavedDoc = (await import('../../../../lib/pdfStudio/render/persistence'))
      .putSavedDoc as ReturnType<typeof vi.fn>
    const template = {
      id: 't1',
      name: 'Ficha',
      doc: pdfDoc(1),
      savedAt: 1,
      kind: 'template' as const,
    }
    mocks.listSavedDocs.mockResolvedValue([template])
    const hook = renderWorkspace(emptyDoc())
    await flushAsyncEffects()

    act(() => {
      hook.result.current.updateSavedMeta('t1', {
        description: 'Ficha de ingreso',
        tags: ['ingreso', 'medif'],
        status: 'draft',
      })
    })

    const updated = hook.result.current.saved.find((s) => s.id === 't1')
    expect(updated).toMatchObject({
      description: 'Ficha de ingreso',
      tags: ['ingreso', 'medif'],
      status: 'draft',
    })
    expect(putSavedDoc).toHaveBeenCalledWith(
      'test-user',
      expect.objectContaining({ id: 't1', status: 'draft' }),
    )
  })

  it('duplicateSaved devuelve la copia: hereda metadatos y nace como borrador', async () => {
    const template = {
      id: 't1',
      name: 'Ficha',
      doc: pdfDoc(1),
      savedAt: 1,
      kind: 'template' as const,
      description: 'Ficha de ingreso',
      tags: ['ingreso'],
      status: 'ready' as const,
    }
    mocks.listSavedDocs.mockResolvedValue([template])
    const hook = renderWorkspace(emptyDoc())
    await flushAsyncEffects()

    let copy: ReturnType<typeof hook.result.current.duplicateSaved> | undefined
    act(() => {
      copy = hook.result.current.duplicateSaved(template)
    })

    expect(copy).toMatchObject({
      name: 'Ficha copia',
      description: 'Ficha de ingreso',
      tags: ['ingreso'],
      status: 'draft',
      kind: 'template',
    })
    expect(copy?.id).not.toBe('t1')
    expect(hook.result.current.saved[0]?.id).toBe(copy?.id)
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

  it('al borrar una creación también borra el PDF subido al servidor', async () => {
    // Cada guardado sube un PDF. Antes de esto, borrar quitaba el registro local
    // y la plantilla remota pero dejaba ese PDF huérfano para siempre: ninguna
    // pantalla vuelve a mostrarlo y ningún camino lo borraba.
    mocks.listSavedDocs.mockResolvedValue([
      {
        id: 'local-1',
        name: 'Contrato',
        doc: pdfDoc(1),
        savedAt: 1,
        kind: 'creation',
        serverPdf: { id: 'remoto-9', uploadedAt: '2026-08-01T00:00:00.000Z' },
      },
    ])
    const hook = renderWorkspace(pdfDoc(1))
    await flushAsyncEffects()

    act(() => hook.result.current.removeSaved('local-1'))

    expect(mocks.deletePdfStudioSavedPdf).toHaveBeenCalledWith('remoto-9')
  })

  it('no llama al servidor si esa creación nunca se subió', async () => {
    mocks.listSavedDocs.mockResolvedValue([
      { id: 'local-2', name: 'Sin subir', doc: pdfDoc(1), savedAt: 1, kind: 'creation' },
    ])
    const hook = renderWorkspace(pdfDoc(1))
    await flushAsyncEffects()

    act(() => hook.result.current.removeSaved('local-2'))

    expect(mocks.deletePdfStudioSavedPdf).not.toHaveBeenCalled()
  })
})
