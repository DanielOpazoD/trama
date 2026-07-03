import { describe, expect, it } from 'vitest'
import { emptyDoc } from '../../../../lib/pdfStudio/model/model'
import type { SavedDoc } from '../../../../lib/pdfStudio/render/persistence'
import {
  countSavedTemplatesByStatus,
  filterSavedTemplates,
  parseTemplateTags,
} from './workspaceTemplateFilter'

const template = (overrides: Partial<SavedDoc> & { id: string }): SavedDoc => ({
  name: overrides.id,
  doc: emptyDoc(),
  savedAt: 1,
  kind: 'template',
  ...overrides,
})

const templates = [
  template({ id: 'a', name: 'Ingreso paciente', tags: ['medif', 'ingreso'] }),
  template({
    id: 'b',
    name: 'Alta',
    description: 'Resumen de alta del paciente',
    status: 'draft',
  }),
  template({ id: 'c', name: 'Consentimiento' }),
]

describe('filterSavedTemplates', () => {
  it('busca en nombre, descripción y tags (todos los tokens deben calzar)', () => {
    expect(filterSavedTemplates(templates, 'medif').map((s) => s.id)).toEqual(['a'])
    expect(filterSavedTemplates(templates, 'resumen alta').map((s) => s.id)).toEqual([
      'b',
    ])
    expect(filterSavedTemplates(templates, 'paciente').map((s) => s.id)).toEqual([
      'a',
      'b',
    ])
    expect(filterSavedTemplates(templates, 'paciente medif').map((s) => s.id)).toEqual([
      'a',
    ])
  })

  it('filtra por estado: sin status guardado cuenta como lista (compat)', () => {
    expect(filterSavedTemplates(templates, '', 'ready').map((s) => s.id)).toEqual([
      'a',
      'c',
    ])
    expect(filterSavedTemplates(templates, '', 'draft').map((s) => s.id)).toEqual(['b'])
    expect(filterSavedTemplates(templates, '', 'all')).toHaveLength(3)
  })

  it('combina texto y estado', () => {
    expect(filterSavedTemplates(templates, 'paciente', 'draft').map((s) => s.id)).toEqual(
      ['b'],
    )
  })
})

describe('countSavedTemplatesByStatus', () => {
  it('cuenta listas (incluye registros viejos sin status) y borradores', () => {
    expect(countSavedTemplatesByStatus(templates)).toEqual({ ready: 2, draft: 1 })
  })
})

describe('parseTemplateTags', () => {
  it('limpia espacios, # inicial, vacíos y duplicados (case-insensitive)', () => {
    expect(parseTemplateTags(' medif, #Ingreso , , ingreso, alta ')).toEqual([
      'medif',
      'Ingreso',
      'alta',
    ])
    expect(parseTemplateTags('')).toEqual([])
  })
})
