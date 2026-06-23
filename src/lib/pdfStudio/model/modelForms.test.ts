import { describe, it, expect } from 'vitest'
import {
  pruneFormFields,
  makePdfFormFieldDraft,
  clonePdfFormField,
  addPdfFormField,
  renamePdfFormField,
  setPdfFormFieldValue,
  translatePdfFormField,
  resizePdfFormField,
  deletePdfFormField,
  isPdfTemplate,
  emptyPdfFormValue,
  clearPdfFormFieldValues,
} from './modelForms'
import type { PdfDoc, PdfFormFieldDraft, PdfPage } from './modelTypes'

/**
 * Modelo de campos de formulario del editor PDF (plantillas rellenables).
 * Cierra la trilogía del modelo con N6 (páginas) y N7 (anotaciones). Todas las
 * operaciones son puras e inmutables, con no-op (mismo objeto) cuando no hay
 * cambio. Los tests fijan lo delicado: la normalización de la caja a [0,1] con
 * lados mínimos, el valor vacío por tipo de campo y el clonado con nombre
 * derivado.
 */

const MIN = 0.018

function page(id: string): PdfPage {
  return { id, annotations: [], rotationQuarters: 0, kind: 'pdf', sourceId: 's', pageIndex: 0 }
}

function field(id: string, pageId: string, over: Partial<PdfFormFieldDraft> = {}): PdfFormFieldDraft {
  return {
    id,
    pageId,
    fieldKind: 'text',
    name: id,
    value: '',
    xRatio: 0.25,
    yRatio: 0.25,
    wRatio: 0.2,
    hRatio: 0.1,
    ...over,
  }
}

function doc(pages: PdfPage[], formFields: PdfFormFieldDraft[] = []): PdfDoc {
  const file = new File([], 's.pdf', { type: 'application/pdf' })
  return { sources: [{ id: 's', kind: 'pdf', file, pageCount: pages.length }], pages, formFields }
}

describe('normalización de caja (makePdfFormFieldDraft / resize / translate)', () => {
  it('acota la posición a [0, 1-min] y los lados a [min, 1-pos]', () => {
    const f = makePdfFormFieldDraft(
      field('x', 'pg-0', { xRatio: -0.5, yRatio: 0.5, wRatio: 0.001, hRatio: 0.5 }),
    )
    expect(f.id.startsWith('f')).toBe(true)
    expect(f.xRatio).toBe(0) // max(0, -0.5)
    expect(f.wRatio).toBe(MIN) // max(min, 0.001) acotado al lado mínimo
    expect(f.yRatio).toBe(0.5)
  })

  it('translatePdfFormField mueve y reclampa al borde', () => {
    const d = doc([page('pg-0')], [field('fld-a', 'pg-0', { xRatio: 0.9 })])
    const after = translatePdfFormField(d, 'fld-a', 0.5, 0) // 0.9+0.5 = 1.4 → tope
    expect(after.formFields![0]!.xRatio).toBeCloseTo(1 - MIN, 5)
  })

  it('resizePdfFormField fija la caja normalizada', () => {
    const d = doc([page('pg-0')], [field('fld-a', 'pg-0')])
    const after = resizePdfFormField(d, 'fld-a', {
      xRatio: 0.1,
      yRatio: 0.1,
      wRatio: 0.0001,
      hRatio: 0.3,
    })
    expect(after.formFields![0]!.wRatio).toBe(MIN)
    expect(after.formFields![0]!.hRatio).toBe(0.3)
  })
})

describe('CRUD de campos', () => {
  it('addPdfFormField agrega si la página existe; no-op si no', () => {
    const d = doc([page('pg-0')])
    const added = addPdfFormField(d, field('fld-a', 'pg-0'))
    expect(added.formFields).toHaveLength(1)
    expect(addPdfFormField(d, field('fld-b', 'pg-missing'))).toBe(d)
  })

  it('renamePdfFormField recorta; nombre vacío es no-op', () => {
    const d = doc([page('pg-0')], [field('fld-a', 'pg-0', { name: 'viejo' })])
    expect(renamePdfFormField(d, 'fld-a', '  nuevo  ').formFields![0]!.name).toBe('nuevo')
    expect(renamePdfFormField(d, 'fld-a', '   ')).toBe(d)
  })

  it('setPdfFormFieldValue actualiza el valor del campo correcto', () => {
    const d = doc([page('pg-0')], [field('fld-a', 'pg-0'), field('fld-b', 'pg-0')])
    const after = setPdfFormFieldValue(d, 'fld-b', 'hola')
    expect(after.formFields![0]!.value).toBe('')
    expect(after.formFields![1]!.value).toBe('hola')
  })

  it('deletePdfFormField quita por id; id ausente es no-op (mismo objeto)', () => {
    const d = doc([page('pg-0')], [field('fld-a', 'pg-0')])
    expect(deletePdfFormField(d, 'fld-a').formFields).toEqual([])
    expect(deletePdfFormField(d, 'nope')).toBe(d)
  })
})

describe('clonePdfFormField', () => {
  it('clona con id nuevo, nombre derivado y pageId override', () => {
    const original = field('fld-a', 'pg-0', { name: 'firma' })
    const copy = clonePdfFormField(original, 'pg-1')
    expect(copy.id).not.toBe(original.id)
    expect(copy.id.startsWith('f')).toBe(true)
    expect(copy.pageId).toBe('pg-1')
    expect(copy.name).toMatch(/^firma_copia_\d+$/)
  })
})

describe('valores y plantilla', () => {
  it('emptyPdfFormValue: checkbox→false, resto→null', () => {
    expect(emptyPdfFormValue('checkbox')).toBe(false)
    expect(emptyPdfFormValue('text')).toBeNull()
  })

  it('isPdfTemplate refleja si hay campos', () => {
    expect(isPdfTemplate(doc([page('pg-0')]))).toBe(false)
    expect(isPdfTemplate(doc([page('pg-0')], [field('fld-a', 'pg-0')]))).toBe(true)
  })

  it('clearPdfFormFieldValues vacía por tipo (texto→"", checkbox→false); no-op sin campos', () => {
    const d = doc(
      [page('pg-0')],
      [
        field('fld-a', 'pg-0', { fieldKind: 'text', value: 'algo' }),
        field('fld-b', 'pg-0', { fieldKind: 'checkbox', value: true }),
      ],
    )
    const cleared = clearPdfFormFieldValues(d)
    expect(cleared.formFields![0]!.value).toBe('')
    expect(cleared.formFields![1]!.value).toBe(false)

    const empty = doc([page('pg-0')])
    expect(clearPdfFormFieldValues(empty)).toBe(empty)
  })
})

describe('pruneFormFields', () => {
  it('conserva solo los campos cuya página sigue existiendo', () => {
    const fields = [field('fld-a', 'pg-0'), field('fld-b', 'pg-gone')]
    expect(pruneFormFields(fields, [page('pg-0')]).map((f) => f.id)).toEqual(['fld-a'])
  })

  it('tolera formFields undefined', () => {
    expect(pruneFormFields(undefined, [page('pg-0')])).toEqual([])
  })
})
