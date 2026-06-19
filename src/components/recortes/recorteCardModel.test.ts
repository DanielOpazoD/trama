import { describe, expect, it } from 'vitest'
import type { Recorte, RecorteSuggestion } from '../../api'
import {
  buildPromoteSeedFromSuggestion,
  formatRecorteStamp,
  looksLikePlaceholder,
  recorteCaptureModeLabel,
  recorteTargetLabel,
} from './recorteCardModel'

function makeRecorte(overrides: Partial<Recorte> = {}): Recorte {
  return {
    id: 'r1',
    text: 'Imagen guardada',
    sourceUrl: null,
    sourceTitle: 'Portada',
    sourceAuthor: null,
    note: null,
    imageUrl: null,
    imageKey: null,
    images: [],
    captureMode: 'image',
    status: 'pending',
    promotedTarget: null,
    promotedId: null,
    captureSource: null,
    capturedAt: null,
    createdAt: '2026-06-10T12:00:00.000Z',
    updatedAt: '2026-06-10T12:00:00.000Z',
    ...overrides,
  }
}

describe('recorteCardModel', () => {
  it('formatea fechas y etiquetas visibles de destino/modo', () => {
    expect(formatRecorteStamp('2026-06-10T12:00:00.000Z')).toContain('2026')
    expect(formatRecorteStamp(null)).toBe('')
    expect(recorteTargetLabel('quote')).toBe('cita')
    expect(recorteCaptureModeLabel('video')).toBe('video')
  })

  it('detecta pies de foto placeholder para reemplazo OCR', () => {
    const recorte = makeRecorte()

    expect(looksLikePlaceholder('', recorte)).toBe(true)
    expect(looksLikePlaceholder('Imagen guardada', recorte)).toBe(true)
    expect(looksLikePlaceholder('Portada', recorte)).toBe(true)
    expect(looksLikePlaceholder('Texto escrito por el usuario', recorte)).toBe(false)
  })

  it('construye semillas de promoción desde sugerencias de IA', () => {
    const quoteSuggestion: RecorteSuggestion = {
      target: 'quote',
      title: 'Frase importante',
      rationale: '',
      relatedEntityIds: ['e1'],
      suggestedEntityName: null,
      suggestedEntityType: null,
      relatedEntities: [{ id: 'e1', name: 'Hannah Arendt', type: 'persona' }],
    }
    const entitySuggestion: RecorteSuggestion = {
      target: 'entity',
      title: 'Nueva entidad',
      rationale: '',
      relatedEntityIds: [],
      suggestedEntityName: 'Archivo',
      suggestedEntityType: 'institucion',
      relatedEntities: [],
    }

    expect(buildPromoteSeedFromSuggestion(quoteSuggestion)).toEqual({
      title: 'Frase importante',
      entityId: 'e1',
      entityName: 'Hannah Arendt',
      entityType: 'persona',
    })
    expect(buildPromoteSeedFromSuggestion(entitySuggestion)).toEqual({
      title: 'Nueva entidad',
      entityName: 'Archivo',
      entityType: 'institucion',
    })
  })
})
