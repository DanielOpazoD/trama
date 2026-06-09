import { describe, expect, it } from 'vitest'
import {
  addImageSource,
  emptyDoc,
  repeatDocPages,
  type PdfDoc,
  type PdfFormFieldDraft,
} from '../../../../../lib/pdfStudio/model/model'
import { parseTemplateFillRows } from './pdfTemplateFillImport'
import { buildMailMergeDoc } from './pdfTemplateMailMerge'

function img(name = 'hoja.png'): File {
  return new File(['x'], name, { type: 'image/png' })
}

function field(
  partial: Partial<PdfFormFieldDraft> & { pageId: string },
): PdfFormFieldDraft {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    fieldKind: 'text',
    name: 'nombre',
    value: '',
    xRatio: 0.1,
    yRatio: 0.1,
    wRatio: 0.2,
    hRatio: 0.05,
    ...partial,
  }
}

/** Planilla de prueba: 1 página imagen con un casillero `nombre` y uno `ok`. */
function templateDoc(): PdfDoc {
  const base = addImageSource(emptyDoc(), img())
  const pageId = base.pages[0]!.id
  return {
    ...base,
    formFields: [
      field({ pageId, name: 'nombre' }),
      field({ pageId, name: 'ok', fieldKind: 'checkbox', value: false }),
    ],
  }
}

describe('parseTemplateFillRows', () => {
  it('CSV con cabecera + N filas → N copias', () => {
    const rows = parseTemplateFillRows('nombre,ok\nAna,si\nBruno,no\nCarla,x')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ nombre: 'Ana', ok: 'si' })
    expect(rows[2]).toEqual({ nombre: 'Carla', ok: 'x' })
  })

  it('CSV name,value (formato de copia única) degenera a UNA fila', () => {
    const rows = parseTemplateFillRows('name,value\nnombre,Ana\nok,true')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ nombre: 'Ana', ok: 'true' })
  })

  it('JSON array de objetos → N copias; filas vacías se descartan', () => {
    const rows = parseTemplateFillRows('[{"nombre":"Ana"},{"nombre":"Bruno"},{}]')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual({ nombre: 'Bruno' })
  })

  it('JSON {rows:[...]} también vale', () => {
    const rows = parseTemplateFillRows('{"rows":[{"nombre":"Ana"},{"nombre":"Bo"}]}')
    expect(rows).toHaveLength(2)
  })

  it('sin filas de datos lanza con mensaje claro', () => {
    expect(() => parseTemplateFillRows('nombre,ok')).toThrow(/filas de datos/)
    expect(() => parseTemplateFillRows('')).toThrow()
  })
})

describe('repeatDocPages', () => {
  it('agrega bloques completos en orden secuencial con ids nuevos', () => {
    const doc = templateDoc()
    const out = repeatDocPages(doc, 3)
    expect(out.pages).toHaveLength(3)
    // Sources compartidos: no se re-importa el archivo.
    expect(out.sources).toHaveLength(1)
    expect(new Set(out.pages.map((p) => p.id)).size).toBe(3)
    expect(out.pages.every((p) => p.sourceId === doc.sources[0]!.id)).toBe(true)
    // Cada copia trae sus casilleros clonados apuntando a su página.
    expect(out.formFields).toHaveLength(6)
    const idsByPage = new Set(out.formFields!.map((f) => f.pageId))
    expect(idsByPage).toEqual(new Set(out.pages.map((p) => p.id)))
  })

  it('copies <= 1 es no-op', () => {
    const doc = templateDoc()
    expect(repeatDocPages(doc, 1)).toBe(doc)
    expect(repeatDocPages(doc, 0)).toBe(doc)
  })
})

describe('buildMailMergeDoc', () => {
  it('aplica la fila i a los casilleros de la copia i', () => {
    const doc = templateDoc()
    const { doc: merged, applied } = buildMailMergeDoc(doc, [
      { nombre: 'Ana', ok: 'si' },
      { nombre: 'Bruno', ok: 'no' },
    ])
    expect(merged.pages).toHaveLength(2)
    expect(applied).toBe(4)
    // Los clones llevan nombre único (`_copia_N`, exigencia AcroForm) pero el
    // matching de columnas se hace contra el nombre original de su posición.
    const byProto = (fields: typeof merged.formFields, proto: string) =>
      fields!.find((f) => f.name === proto || f.name.startsWith(`${proto}_copia_`))
    const block0 = merged.formFields!.filter((f) => f.pageId === merged.pages[0]!.id)
    const block1 = merged.formFields!.filter((f) => f.pageId === merged.pages[1]!.id)
    expect(byProto(block0, 'nombre')!.value).toBe('Ana')
    expect(byProto(block0, 'ok')!.value).toBe(true)
    expect(byProto(block1, 'nombre')!.value).toBe('Bruno')
    expect(byProto(block1, 'ok')!.value).toBe(false)
    // Nombres únicos en todo el lote (AcroForm exige unicidad al crear campos).
    expect(new Set(merged.formFields!.map((f) => f.name)).size).toBe(4)
  })

  it('matching case-insensitive de nombres de columna', () => {
    const doc = templateDoc()
    const { doc: merged, applied } = buildMailMergeDoc(doc, [{ NOMBRE: 'Ana' }])
    expect(applied).toBe(1)
    expect(merged.formFields!.find((f) => f.name === 'nombre')!.value).toBe('Ana')
  })

  it('sin filas devuelve el doc intacto', () => {
    const doc = templateDoc()
    expect(buildMailMergeDoc(doc, []).doc).toBe(doc)
  })
})
