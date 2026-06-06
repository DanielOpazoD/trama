import { describe, expect, it } from 'vitest'
import { addPdfSource, emptyDoc } from './model'
import { assessPdfOcrDocument } from './pdfOcrLimits'

const pdf = (name = 'scan.pdf') =>
  new File(['%PDF-1.4'], name, { type: 'application/pdf' })

describe('pdfStudio/pdfOcrLimits', () => {
  it('advierte cuando el documento ya es pesado para OCR client-side', () => {
    const doc = addPdfSource(emptyDoc(), pdf(), 18)

    const assessment = assessPdfOcrDocument(doc)

    expect(assessment.severity).toBe('warn')
    expect(assessment.messages.join(' ')).toContain('18 páginas')
    expect(assessment.canRunClientSide).toBe(true)
  })

  it('bloquea OCR client-side para documentos claramente grandes', () => {
    const doc = addPdfSource(emptyDoc(), pdf(), 55)

    const assessment = assessPdfOcrDocument(doc)

    expect(assessment.severity).toBe('blocked')
    expect(assessment.canRunClientSide).toBe(false)
    expect(assessment.messages.join(' ')).toContain('55 páginas')
    expect(assessment.messages.join(' ')).toContain('OCRmyPDF')
  })
})
