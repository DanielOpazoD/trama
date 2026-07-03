import { describe, expect, it } from 'vitest'
import type { PdfStudioTemplateRemote } from '../../../../api/pdfStudioTemplates'
import type { SavedDoc } from '../../../../lib/pdfStudio/render/persistence'
import { emptyDoc } from '../../../../lib/pdfStudio/model/model'
import { planTemplateCloudSync } from './templateCloudPlan'

const T0 = Date.parse('2026-07-03T12:00:00.000Z')

function local(overrides: Partial<SavedDoc>): SavedDoc {
  return {
    id: 'doc-1',
    name: 'Receta',
    doc: emptyDoc(),
    savedAt: T0,
    kind: 'template',
    ...overrides,
  }
}

function remote(overrides: Partial<PdfStudioTemplateRemote>): PdfStudioTemplateRemote {
  return {
    id: 'remote-1',
    savedDocId: 'doc-1',
    name: 'Receta',
    description: '',
    tags: [],
    status: 'ready',
    pageCount: 1,
    fieldCount: 3,
    byteSize: 10,
    savedAt: new Date(T0).toISOString(),
    createdAt: new Date(T0).toISOString(),
    updatedAt: new Date(T0).toISOString(),
    ...overrides,
  }
}

describe('planTemplateCloudSync', () => {
  it('sube la plantilla local nueva y baja la remota desconocida', () => {
    const plan = planTemplateCloudSync(
      [local({ id: 'solo-local' })],
      [remote({ savedDocId: 'solo-remota' })],
    )
    expect(plan.uploads.map((s) => s.id)).toEqual(['solo-local'])
    expect(plan.downloads.map((r) => r.savedDocId)).toEqual(['solo-remota'])
    expect(plan.deleteLocals).toEqual([])
  })

  it('con ambos lados gana el savedAt más nuevo; en empate sólo refresca marcador', () => {
    const newerLocal = planTemplateCloudSync(
      [local({ savedAt: T0 + 60_000 })],
      [remote({})],
    )
    expect(newerLocal.uploads).toHaveLength(1)
    expect(newerLocal.downloads).toHaveLength(0)

    const newerRemote = planTemplateCloudSync(
      [local({})],
      [remote({ savedAt: new Date(T0 + 60_000).toISOString() })],
    )
    expect(newerRemote.downloads).toHaveLength(1)
    expect(newerRemote.uploads).toHaveLength(0)

    const inSync = planTemplateCloudSync([local({})], [remote({})])
    expect(inSync.uploads).toHaveLength(0)
    expect(inSync.downloads).toHaveLength(0)
    expect(inSync.links).toHaveLength(1)

    const linked = planTemplateCloudSync(
      [local({ cloudTemplate: { id: 'remote-1', savedAt: new Date(T0).toISOString() } })],
      [remote({})],
    )
    expect(linked.links).toHaveLength(0)
  })

  it('la deriva pequeña de reloj no hace ping-pong', () => {
    const plan = planTemplateCloudSync([local({ savedAt: T0 + 1500 })], [remote({})])
    expect(plan.uploads).toHaveLength(0)
    expect(plan.downloads).toHaveLength(0)
  })

  it('local ya sincronizada que desapareció del servidor se borra localmente', () => {
    const plan = planTemplateCloudSync(
      [local({ cloudTemplate: { id: 'remote-1', savedAt: new Date(T0).toISOString() } })],
      [],
    )
    expect(plan.deleteLocals.map((s) => s.id)).toEqual(['doc-1'])
    expect(plan.uploads).toEqual([])
  })

  it('las copias con datos y las creaciones no entran nunca al plan', () => {
    const plan = planTemplateCloudSync(
      [
        local({ id: 'copia', kind: 'filled-template' }),
        local({ id: 'creacion', kind: 'creation' }),
      ],
      [],
    )
    expect(plan.uploads).toEqual([])
    expect(plan.deleteLocals).toEqual([])
  })
})
