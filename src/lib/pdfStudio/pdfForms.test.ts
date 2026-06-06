import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { fillPdfForm, inspectPdfForm, type PdfFormFillValues } from './pdfForms'

async function formPdfFile(name = 'formulario.pdf'): Promise<File> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  const form = pdf.getForm()

  const fullName = form.createTextField('fullName')
  fullName.setText('Inicial')
  fullName.addToPage(page, { x: 72, y: 680, width: 220, height: 24 })

  const visitDate = form.createTextField('visitDate')
  visitDate.addToPage(page, { x: 72, y: 640, width: 140, height: 24 })

  const approved = form.createCheckBox('approved')
  approved.addToPage(page, { x: 72, y: 600, width: 18, height: 18 })

  const bytes = await pdf.save()
  return new File([bytes as BlobPart], name, { type: 'application/pdf' })
}

describe('pdfStudio/pdfForms', () => {
  it('inspecciona campos AcroForm existentes con nombre, tipo y valor', async () => {
    const result = await inspectPdfForm(await formPdfFile())

    expect(result.fieldCount).toBe(3)
    expect(result.fields).toEqual([
      {
        name: 'approved',
        type: 'checkbox',
        value: false,
      },
      {
        name: 'fullName',
        type: 'text',
        value: 'Inicial',
      },
      {
        name: 'visitDate',
        type: 'text',
        value: '',
      },
    ])
  })

  it('rellena texto y checkbox y puede aplanar el formulario', async () => {
    const values: PdfFormFillValues = {
      fullName: 'Daniel',
      visitDate: '2026-06-06',
      approved: true,
    }

    const { blob } = await fillPdfForm(await formPdfFile(), values, { flatten: true })
    const loaded = await PDFDocument.load(await blob.arrayBuffer())
    const form = loaded.getForm()

    expect(form.getFields()).toHaveLength(0)
  })

  it('conserva campos editables cuando flatten es falso', async () => {
    const { blob } = await fillPdfForm(
      await formPdfFile(),
      { fullName: 'Editable', approved: true },
      { flatten: false },
    )
    const loaded = await PDFDocument.load(await blob.arrayBuffer())
    const form = loaded.getForm()

    expect(form.getTextField('fullName').getText()).toBe('Editable')
    expect(form.getCheckBox('approved').isChecked()).toBe(true)
    expect(form.getFields()).toHaveLength(3)
  })
})
