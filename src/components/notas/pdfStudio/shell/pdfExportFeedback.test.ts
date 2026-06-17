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

  it('explica errores de redacción como fallos de rasterización segura', () => {
    expect(
      describePdfExportError(new Error('Canvas no disponible para redacción segura')),
    ).toMatch(/rasterizarse|contenido subyacente/i)
  })

  it('explica chunks obsoletos como actualización de la app', () => {
    expect(
      describePdfExportError(
        Object.assign(new Error('Failed to fetch dynamically imported module'), {
          code: 'STALE_APP_ASSET',
        }),
      ),
    ).toMatch(/actualizó|recargando/i)
  })

  it('describe errores específicos al crear PDFs rellenables', () => {
    expect(
      describePdfExportError(
        Object.assign(new Error('Campo duplicado: paciente'), {
          code: 'PDF_FORM_DUPLICATE_FIELD',
        }),
      ),
    ).toMatch(/nombres duplicados/i)

    expect(
      describePdfExportError(
        Object.assign(new Error('Página no encontrada'), {
          code: 'PDF_FORM_PAGE_NOT_FOUND',
        }),
      ),
    ).toMatch(/casillero.*página|página.*casillero/i)

    expect(
      describePdfExportError(
        Object.assign(new Error('Firma inválida'), {
          code: 'PDF_FORM_SIGNATURE_IMAGE_INVALID',
        }),
      ),
    ).toMatch(/imagen de firma/i)
  })
})
