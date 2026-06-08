import { describe, expect, it } from 'vitest'
import { addPdfSource, emptyDoc } from '../model/model'
import { assessPdfOcrDocument } from './pdfOcrLimits'

const pdf = (name = 'scan.pdf') =>
  new File(['%PDF-1.4'], name, { type: 'application/pdf' })

const pdfOfSize = (size: number, name = 'scan.pdf') =>
  new File([new Uint8Array(size)], name, { type: 'application/pdf' })

describe('pdfStudio/pdfOcrLimits', () => {
  it('acepta documentos pequeños sin advertencias', () => {
    const doc = addPdfSource(emptyDoc(), pdf(), 3)

    const assessment = assessPdfOcrDocument(doc)

    expect(assessment.severity).toBe('ok')
    expect(assessment.canRunClientSide).toBe(true)
    expect(assessment.pageCount).toBe(3)
    expect(assessment.messages).toEqual([])
  })

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

  it('advierte cuando el peso del archivo es alto pero aún ejecutable', () => {
    const doc = addPdfSource(emptyDoc(), pdfOfSize(31 * 1024 * 1024), 1)

    const assessment = assessPdfOcrDocument(doc)

    expect(assessment.severity).toBe('warn')
    expect(assessment.canRunClientSide).toBe(true)
    expect(assessment.messages.join(' ')).toContain('31 MB')
  })

  it('bloquea OCR client-side cuando el archivo supera el límite de peso', () => {
    const doc = addPdfSource(emptyDoc(), pdfOfSize(91 * 1024 * 1024), 1)

    const assessment = assessPdfOcrDocument(doc)

    expect(assessment.severity).toBe('blocked')
    expect(assessment.canRunClientSide).toBe(false)
    expect(assessment.messages.join(' ')).toContain('91 MB')
  })
})
