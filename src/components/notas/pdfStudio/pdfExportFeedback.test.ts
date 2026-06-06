import { describe, expect, it } from 'vitest'
import {
  describePdfExportError,
  pdfExportPipelineProgressLabel,
  pdfExportProgressLabel,
} from './pdfExportFeedback'

describe('pdfExportFeedback', () => {
  it('describe el progreso de exportación con conteo de páginas', () => {
    expect(pdfExportProgressLabel(1)).toBe('Preparando 1 página…')
    expect(pdfExportProgressLabel(3)).toBe('Preparando 3 páginas…')
  })

  it('describe fases del pipeline de exportación', () => {
    expect(
      pdfExportPipelineProgressLabel({
        phase: 'process-pages',
        status: 'progress',
        current: 2,
        total: 5,
      }),
    ).toBe('Procesando páginas 2/5…')
    expect(pdfExportPipelineProgressLabel({ phase: 'save', status: 'start' })).toBe(
      'Guardando PDF…',
    )
  })

  it('clasifica errores de fuentes, imágenes y memoria/PDF grande', () => {
    expect(describePdfExportError(new Error('fontkit failed to embed font'))).toMatch(
      /fuente/i,
    )
    expect(describePdfExportError(new Error('Canvas no disponible'))).toMatch(/imagen/i)
    expect(describePdfExportError(new Error('Array buffer allocation failed'))).toMatch(
      /memoria|grande/i,
    )
    expect(describePdfExportError(new Error('Exportación cancelada.'))).toMatch(
      /cancelada/i,
    )
  })
})
