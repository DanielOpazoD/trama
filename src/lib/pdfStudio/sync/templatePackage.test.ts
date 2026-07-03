import { describe, expect, it } from 'vitest'
import type { PdfDoc } from '../model/model'
import {
  packPdfTemplate,
  unpackPdfTemplate,
  TEMPLATE_PACKAGE_VERSION,
} from './templatePackage'

function templateDoc(): PdfDoc {
  const bytes = new Uint8Array(70000)
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
  return {
    title: 'Receta magistral',
    sources: [
      {
        id: 'src-1',
        kind: 'pdf',
        pageCount: 2,
        file: new File([bytes as unknown as BlobPart], 'receta.pdf', {
          type: 'application/pdf',
        }),
      },
    ],
    pages: [
      {
        id: 'p1',
        kind: 'pdf',
        sourceId: 'src-1',
        pageIndex: 0,
        annotations: [],
        rotationQuarters: 0,
      },
      {
        id: 'p2',
        kind: 'pdf',
        sourceId: 'src-1',
        pageIndex: 1,
        annotations: [],
        rotationQuarters: 1,
      },
    ],
    formFields: [
      {
        id: 'f1',
        fieldKind: 'text',
        pageId: 'p1',
        name: 'paciente',
        value: 'María',
        xRatio: 0.1,
        yRatio: 0.2,
        wRatio: 0.3,
        hRatio: 0.05,
        required: true,
        color: '#123456',
      },
    ],
    settings: { footer: { text: 'Dr. Opazo' } },
  }
}

describe('templatePackage', () => {
  it('roundtrip: pack → JSON → unpack conserva estructura y bytes', async () => {
    const doc = templateDoc()
    const pkg = await packPdfTemplate(doc)
    const revived = unpackPdfTemplate(JSON.parse(JSON.stringify(pkg)))

    expect(revived).not.toBeNull()
    expect(revived!.title).toBe('Receta magistral')
    expect(revived!.pages).toEqual(doc.pages)
    expect(revived!.settings).toEqual(doc.settings)
    expect(revived!.formFields?.map((f) => f.name)).toEqual(['paciente'])
    expect(revived!.formFields?.[0]).toMatchObject({
      required: true,
      color: '#123456',
      wRatio: 0.3,
    })
    const original = new Uint8Array(await doc.sources[0]!.file.arrayBuffer())
    const restored = new Uint8Array(await revived!.sources[0]!.file.arrayBuffer())
    expect(restored).toEqual(original)
    expect(revived!.sources[0]!.file.name).toBe('receta.pdf')
    expect(revived!.sources[0]!.file.type).toBe('application/pdf')
    expect(revived!.sources[0]!.pageCount).toBe(2)
  })

  it('empaqueta la plantilla LIMPIA: los valores de casilleros no viajan', async () => {
    const pkg = await packPdfTemplate(templateDoc())
    expect(pkg.formFields[0]!.value).not.toBe('María')
  })

  it('rechaza paquetes con otra versión o forma ajena', () => {
    expect(unpackPdfTemplate(null)).toBeNull()
    expect(
      unpackPdfTemplate({ version: 99, pages: [], formFields: [], sources: [] }),
    ).toBeNull()
    expect(
      unpackPdfTemplate({
        version: TEMPLATE_PACKAGE_VERSION,
        pages: [],
        formFields: [],
        sources: [{ id: 1, dataBase64: 3 }],
      }),
    ).toBeNull()
  })
})
