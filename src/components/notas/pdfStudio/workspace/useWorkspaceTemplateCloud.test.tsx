import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PdfDoc } from '../../../../lib/pdfStudio/model/model'
import type { SavedDoc } from '../../../../lib/pdfStudio/render/persistence'
import { useWorkspaceTemplateCloud } from './useWorkspaceTemplateCloud'

const api = vi.hoisted(() => ({
  listPdfStudioTemplates: vi.fn(),
  uploadPdfStudioTemplate: vi.fn(),
  downloadPdfStudioTemplatePackage: vi.fn(),
  deletePdfStudioTemplate: vi.fn(),
  listPdfStudioTemplateVersions: vi.fn(),
  downloadPdfStudioTemplateVersion: vi.fn(),
}))

const persistence = vi.hoisted(() => ({
  putSavedDoc: vi.fn(),
  deleteSavedDoc: vi.fn(),
}))

vi.mock('../../../../api/pdfStudioTemplates', () => api)
vi.mock('../../../../lib/pdfStudio/render/persistence', () => ({
  putSavedDoc: persistence.putSavedDoc,
  deleteSavedDoc: persistence.deleteSavedDoc,
  savedTemplateStatus: (saved: { status?: 'draft' | 'ready' }) => saved.status ?? 'ready',
}))

function templateDoc(): PdfDoc {
  return {
    sources: [
      {
        id: 'src-1',
        kind: 'pdf',
        pageCount: 1,
        file: new File(['%PDF-1.4'], 'base.pdf', { type: 'application/pdf' }),
      },
    ],
    pages: [
      {
        id: 'p1',
        kind: 'pdf',
        sourceId: 'src-1',
        pageIndex: 0,
        annotations: [],
        rotationQuarters: 0,
      },
    ],
    formFields: [],
  }
}

function savedTemplate(overrides: Partial<SavedDoc> = {}): SavedDoc {
  return {
    id: 'doc-1',
    name: 'Receta',
    doc: templateDoc(),
    savedAt: Date.parse('2026-07-03T12:00:00.000Z'),
    kind: 'template',
    ...overrides,
  }
}

const remoteFixture = {
  id: 'remote-9',
  savedDocId: 'doc-9',
  name: 'Certificado',
  description: 'Certificado médico',
  tags: ['certificados'],
  status: 'ready' as const,
  pageCount: 1,
  fieldCount: 0,
  byteSize: 10,
  savedAt: '2026-07-01T00:00:00.000Z',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
}

function renderCloud({ enabled = true, userKey = 'user-1' } = {}) {
  return renderHook(() => {
    const [saved, setSaved] = useState<SavedDoc[]>([])
    const cloud = useWorkspaceTemplateCloud({ enabled, setSaved, userKey })
    return { saved, cloud }
  })
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useWorkspaceTemplateCloud', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listPdfStudioTemplates.mockResolvedValue([])
    api.uploadPdfStudioTemplate.mockResolvedValue({
      ...remoteFixture,
      id: 'remote-1',
      savedDocId: 'doc-1',
    })
    api.downloadPdfStudioTemplatePackage.mockResolvedValue({
      version: 1,
      title: 'Certificado',
      pages: [],
      formFields: [],
      sources: [],
    })
  })

  it('el merge inicial sube lo local nuevo y materializa lo remoto', async () => {
    api.listPdfStudioTemplates.mockResolvedValue([remoteFixture])
    const hook = renderCloud()

    act(() => hook.result.current.cloud.syncTemplates([savedTemplate()]))
    await flush()

    expect(api.uploadPdfStudioTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ savedDocId: 'doc-1', name: 'Receta', status: 'ready' }),
    )
    expect(api.downloadPdfStudioTemplatePackage).toHaveBeenCalledWith('remote-9')
    const materialized = hook.result.current.saved.find((s) => s.id === 'doc-9')
    expect(materialized).toMatchObject({
      name: 'Certificado',
      kind: 'template',
      description: 'Certificado médico',
      cloudTemplate: { id: 'remote-9' },
    })
    expect(persistence.putSavedDoc).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ id: 'doc-9' }),
    )
  })

  it('pushTemplate sube la plantilla y guarda el marcador de nube', async () => {
    const hook = renderCloud()

    act(() => hook.result.current.cloud.pushTemplate(savedTemplate()))
    await flush()

    const call = api.uploadPdfStudioTemplate.mock.calls[0]![0] as {
      packageJson: string
      savedAt: number
    }
    expect(JSON.parse(call.packageJson)).toMatchObject({ version: 1 })
    expect(persistence.putSavedDoc).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        cloudTemplate: { id: 'remote-1', savedAt: remoteFixture.savedAt },
      }),
    )
  })

  it('NUNCA sube copias con datos ni actúa deshabilitado o anónimo', async () => {
    const hook = renderCloud()
    act(() =>
      hook.result.current.cloud.pushTemplate(savedTemplate({ kind: 'filled-template' })),
    )
    const anon = renderCloud({ userKey: 'anon' })
    act(() => anon.result.current.cloud.syncTemplates([savedTemplate()]))
    const off = renderCloud({ enabled: false })
    act(() => off.result.current.cloud.syncTemplates([savedTemplate()]))
    await flush()

    expect(api.uploadPdfStudioTemplate).not.toHaveBeenCalled()
    expect(api.listPdfStudioTemplates).not.toHaveBeenCalled()
  })

  it('propaga el borrado hecho en otro equipo (marcador sin remoto)', async () => {
    api.listPdfStudioTemplates.mockResolvedValue([])
    const hook = renderCloud()
    const synced = savedTemplate({
      cloudTemplate: { id: 'remote-1', savedAt: '2026-07-03T12:00:00.000Z' },
    })

    act(() => hook.result.current.cloud.syncTemplates([synced]))
    await flush()

    expect(persistence.deleteSavedDoc).toHaveBeenCalledWith('user-1', 'doc-1')
    expect(api.uploadPdfStudioTemplate).not.toHaveBeenCalled()
  })

  it('removeRemoteTemplate borra en el servidor sólo si hay marcador', async () => {
    api.deletePdfStudioTemplate.mockResolvedValue(undefined)
    const hook = renderCloud()

    act(() => hook.result.current.cloud.removeRemoteTemplate(savedTemplate()))
    act(() =>
      hook.result.current.cloud.removeRemoteTemplate(
        savedTemplate({ cloudTemplate: { id: 'remote-1', savedAt: 'x' } }),
      ),
    )
    await flush()

    expect(api.deletePdfStudioTemplate).toHaveBeenCalledTimes(1)
    expect(api.deletePdfStudioTemplate).toHaveBeenCalledWith('remote-1')
  })

  it('restaurar una versión la materializa como estado actual y la re-sube', async () => {
    api.downloadPdfStudioTemplateVersion.mockResolvedValue({
      version: 1,
      title: 'Vieja',
      pages: [],
      formFields: [],
      sources: [],
    })
    const hook = renderCloud()
    const synced = savedTemplate({
      cloudTemplate: { id: 'remote-1', savedAt: '2026-07-03T12:00:00.000Z' },
    })

    let ok = false
    await act(async () => {
      ok = await hook.result.current.cloud.restoreTemplateVersion(synced, 'v1')
    })

    expect(ok).toBe(true)
    expect(api.downloadPdfStudioTemplateVersion).toHaveBeenCalledWith('remote-1', 'v1')
    const restored = hook.result.current.saved.find((s) => s.id === 'doc-1')
    expect(restored?.doc.title).toBe('Vieja')
    expect(restored?.savedAt).toBeGreaterThan(synced.savedAt)
    expect(api.uploadPdfStudioTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ savedDocId: 'doc-1' }),
    )
    // Sin marcador de nube no hay historial que consultar
    await expect(
      hook.result.current.cloud.listTemplateVersions(savedTemplate()),
    ).resolves.toEqual([])
    expect(api.listPdfStudioTemplateVersions).not.toHaveBeenCalled()
  })

  it('falla silenciosamente sin conexión: la biblioteca local no cambia', async () => {
    api.listPdfStudioTemplates.mockRejectedValue(new Error('offline'))
    const hook = renderCloud()

    act(() => hook.result.current.cloud.syncTemplates([savedTemplate()]))
    await flush()

    expect(hook.result.current.saved).toEqual([])
    expect(persistence.deleteSavedDoc).not.toHaveBeenCalled()
  })
})
