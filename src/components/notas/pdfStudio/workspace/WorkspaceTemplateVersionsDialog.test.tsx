import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyDoc } from '../../../../lib/pdfStudio/model/model'
import type { SavedDoc } from '../../../../lib/pdfStudio/render/persistence'
import type { WorkspaceTemplateCloud } from './useWorkspaceTemplateCloud'
import { WorkspaceTemplateVersionsDialog } from './WorkspaceTemplateVersionsDialog'

const saved: SavedDoc = {
  id: 'doc-1',
  name: 'Receta',
  doc: emptyDoc(),
  savedAt: Date.parse('2026-07-03T12:00:00.000Z'),
  kind: 'template',
  cloudTemplate: { id: 'remote-1', savedAt: '2026-07-03T12:00:00.000Z' },
}

function cloudMock(overrides: Partial<WorkspaceTemplateCloud> = {}) {
  return {
    syncTemplates: vi.fn(),
    pushTemplate: vi.fn(),
    removeRemoteTemplate: vi.fn(),
    listTemplateVersions: vi.fn(async () => [
      {
        id: 'v1',
        name: 'Receta',
        byteSize: 2048,
        savedAt: '2026-07-02T10:00:00.000Z',
        createdAt: '2026-07-02T10:00:00.000Z',
      },
    ]),
    restoreTemplateVersion: vi.fn(async () => true),
    ...overrides,
  } satisfies WorkspaceTemplateCloud
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('WorkspaceTemplateVersionsDialog', () => {
  it('lista el historial y restaura una versión con feedback', async () => {
    const cloud = cloudMock()
    render(
      <WorkspaceTemplateVersionsDialog
        saved={saved}
        templateCloud={cloud}
        onClose={vi.fn()}
      />,
    )
    await flush()

    expect(screen.getByRole('dialog', { name: 'Versiones de Receta' })).toBeVisible()
    expect(screen.getByText(/2 KB/)).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: /Restaurar la versión/ }))
    await flush()

    expect(cloud.restoreTemplateVersion).toHaveBeenCalledWith(saved, 'v1')
    expect(screen.getByRole('status').textContent).toContain('Restaurada la versión')
  })

  it('sin versiones muestra el estado vacío', async () => {
    const cloud = cloudMock({ listTemplateVersions: vi.fn(async () => []) })
    render(
      <WorkspaceTemplateVersionsDialog
        saved={saved}
        templateCloud={cloud}
        onClose={vi.fn()}
      />,
    )
    await flush()
    expect(screen.getByText(/Todavía no hay versiones anteriores/)).toBeVisible()
  })
})
