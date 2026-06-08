import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName } from 'pdf-lib'
import { makePdfFormFieldDraft } from './model'
import {
  fillPdfForm,
  inspectPdfForm,
  writePdfFormFields,
  type PdfFormFillValues,
} from './pdfForms'

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
  it('inspecciona campos AcroForm existentes con nombre, tipo, valor y geometría de widgets', async () => {
    const result = await inspectPdfForm(await formPdfFile())

    expect(result.fieldCount).toBe(3)
    expect(result.fields).toMatchObject([
      expect.objectContaining({
        name: 'approved',
        type: 'checkbox',
        value: false,
      }),
      expect.objectContaining({
        name: 'fullName',
        type: 'text',
        value: 'Inicial',
      }),
      expect.objectContaining({
        name: 'visitDate',
        type: 'text',
        value: '',
      }),
    ])
    const fullName = result.fields.find((field) => field.name === 'fullName')
    expect(fullName?.required).toBe(false)
    expect(fullName?.readOnly).toBe(false)
    expect(fullName?.widgets).toHaveLength(1)
    expect(fullName?.widgets[0]).toMatchObject({
      pageIndex: 0,
      widgetIndex: 0,
    })
    expect(fullName?.widgets[0]?.xRatio).toBeCloseTo(72 / 612)
    expect(fullName?.widgets[0]?.yRatio).toBeCloseTo((792 - 680 - 24) / 792)
    expect(fullName?.widgets[0]?.wRatio).toBeCloseTo(220 / 612)
    expect(fullName?.widgets[0]?.hRatio).toBeCloseTo(24 / 792)
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

  it('crea campos nuevos sobre un PDF base y puede conservarlos editables', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([600, 800])
    const bytes = await pdf.save()
    const base = new File([bytes as BlobPart], 'base.pdf', { type: 'application/pdf' })
    const pageId = 'page-1'

    const { blob } = await writePdfFormFields(
      base,
      [
        makePdfFormFieldDraft({
          fieldKind: 'text',
          pageId,
          name: 'paciente',
          value: 'Daniel',
          xRatio: 0.1,
          yRatio: 0.2,
          wRatio: 0.4,
          hRatio: 0.05,
          required: true,
        }),
        makePdfFormFieldDraft({
          fieldKind: 'checkbox',
          pageId,
          name: 'acepta',
          value: true,
          xRatio: 0.1,
          yRatio: 0.3,
          wRatio: 0.04,
          hRatio: 0.04,
        }),
      ],
      [pageId],
      { flatten: false },
    )

    const loaded = await PDFDocument.load(await blob.arrayBuffer())
    const form = loaded.getForm()

    expect(form.getTextField('paciente').getText()).toBe('Daniel')
    expect(form.getTextField('paciente').isRequired()).toBe(true)
    expect(form.getCheckBox('acepta').isChecked()).toBe(true)
    expect(form.getFields()).toHaveLength(2)
  })

  it('crea cuadros de texto sin fondo ni borde para imprimir sin tapar el PDF base', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([600, 800])
    const bytes = await pdf.save()
    const base = new File([bytes as BlobPart], 'base.pdf', { type: 'application/pdf' })
    const pageId = 'page-1'

    const { blob } = await writePdfFormFields(
      base,
      [
        makePdfFormFieldDraft({
          fieldKind: 'text',
          pageId,
          name: 'paciente',
          value: 'Daniel',
          xRatio: 0.1,
          yRatio: 0.2,
          wRatio: 0.4,
          hRatio: 0.05,
        }),
      ],
      [pageId],
      { flatten: false },
    )

    const loaded = await PDFDocument.load(await blob.arrayBuffer())
    const widget = loaded.getForm().getTextField('paciente').acroField.getWidgets()[0]
    const appearance = widget?.MK()

    expect(appearance?.has(PDFName.of('BG'))).toBe(false)
    expect(appearance?.has(PDFName.of('BC'))).toBe(false)
    expect(widget?.getBorderStyle()?.getWidth()).toBe(0)
  })

  it('aplana campos nuevos cuando flatten es verdadero', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([600, 800])
    const bytes = await pdf.save()
    const base = new File([bytes as BlobPart], 'base.pdf', { type: 'application/pdf' })
    const pageId = 'page-1'

    const { blob } = await writePdfFormFields(
      base,
      [
        makePdfFormFieldDraft({
          fieldKind: 'text',
          pageId,
          name: 'paciente',
          value: 'Daniel',
          xRatio: 0.1,
          yRatio: 0.2,
          wRatio: 0.4,
          hRatio: 0.05,
        }),
      ],
      [pageId],
      { flatten: true },
    )

    const loaded = await PDFDocument.load(await blob.arrayBuffer())
    expect(loaded.getForm().getFields()).toHaveLength(0)
  })

  it('exporta firmas visuales como imagen sin escribir el data URL como texto', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([600, 800])
    const bytes = await pdf.save()
    const base = new File([bytes as BlobPart], 'base.pdf', { type: 'application/pdf' })
    const pageId = 'page-1'
    const signaturePng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

    const { blob } = await writePdfFormFields(
      base,
      [
        makePdfFormFieldDraft({
          fieldKind: 'signature',
          pageId,
          name: 'firma',
          value: signaturePng,
          xRatio: 0.1,
          yRatio: 0.2,
          wRatio: 0.3,
          hRatio: 0.08,
        }),
      ],
      [pageId],
      { flatten: false },
    )

    const loaded = await PDFDocument.load(await blob.arrayBuffer())
    const form = loaded.getForm()

    expect(form.getButton('firma').getName()).toBe('firma')
    expect(() => form.getTextField('firma')).toThrow()
    expect(form.getFields()).toHaveLength(1)
  })
})
