import { describe, it, expect, beforeAll } from 'vitest'
import {
  movePage,
  movePageByDelta,
  movePages,
  deletePage,
  deletePages,
  rotatePage,
  rotatePages,
  duplicatePages,
  repeatDocPages,
} from './modelPages'
import { reseedIdCounter } from './modelIds'
import type {
  Annotation,
  PdfDoc,
  PdfFormFieldDraft,
  PdfPage,
  PdfSource,
} from './modelTypes'

/**
 * Operaciones de página del editor PDF: son transformaciones puras sobre el
 * modelo PdfDoc (inmutables, devuelven el MISMO doc si no hay cambio) y de ellas
 * depende la integridad del documento al reordenar/borrar/rotar/duplicar. Estos
 * tests fijan los casos límite (índices fuera de rango como no-op, orden de un
 * bloque movido, normalización de rotación 0..3, poda de sources/campos
 * huérfanos y reasignación de ids al clonar).
 */

// nextId comparte un contador global con prefijo (p1, a2, …). El fixture usa
// ids manuales 'p1'/'a1'; reseedeamos alto para que los ids GENERADOS al clonar
// (duplicatePages/repeatDocPages) nunca colisionen con los del fixture.
beforeAll(() => reseedIdCounter(1000))

function source(id: string, pageCount = 3): PdfSource {
  return {
    id,
    kind: 'pdf',
    file: new File([], `${id}.pdf`, { type: 'application/pdf' }),
    pageCount,
  }
}

function page(id: string, sourceId = 's1', pageIndex = 0, annotations: Annotation[] = []): PdfPage {
  return { id, annotations, rotationQuarters: 0, kind: 'pdf', sourceId, pageIndex }
}

function doc(pages: PdfPage[], sources: PdfSource[] = [source('s1')]): PdfDoc {
  return { sources, pages }
}

const ids = (d: PdfDoc) => d.pages.map((p) => p.id)

describe('movePage', () => {
  it('mueve una página a un índice arbitrario', () => {
    const d = doc([page('p1'), page('p2'), page('p3')])
    expect(ids(movePage(d, 0, 2))).toEqual(['p2', 'p3', 'p1'])
  })

  it('es no-op (mismo objeto) con from===to o índices fuera de rango', () => {
    const d = doc([page('p1'), page('p2')])
    expect(movePage(d, 1, 1)).toBe(d)
    expect(movePage(d, -1, 0)).toBe(d)
    expect(movePage(d, 0, 5)).toBe(d)
  })
})

describe('movePageByDelta', () => {
  it('mueve un paso adelante', () => {
    const d = doc([page('p1'), page('p2'), page('p3')])
    expect(ids(movePageByDelta(d, 0, 1))).toEqual(['p2', 'p1', 'p3'])
  })

  it('un delta que sale de rango es no-op', () => {
    const d = doc([page('p1'), page('p2')])
    expect(movePageByDelta(d, 0, -1)).toBe(d) // índice -1
  })
})

describe('movePages (bloque)', () => {
  it('mueve un bloque preservando su orden interno', () => {
    const d = doc([page('p1'), page('p2'), page('p3'), page('p4')])
    expect(ids(movePages(d, [0, 1], 3))).toEqual(['p3', 'p4', 'p1', 'p2'])
  })

  it('ordena y deduplica los índices seleccionados', () => {
    const d = doc([page('p1'), page('p2'), page('p3'), page('p4')])
    // [3,1,1] → seleccion {1,3}; bloque [p2,p4]; resto [p1,p3]; to=0
    expect(ids(movePages(d, [3, 1, 1], 0))).toEqual(['p2', 'p4', 'p1', 'p3'])
  })

  it('es no-op con selección vacía, destino fuera de rango o destino seleccionado', () => {
    const d = doc([page('p1'), page('p2'), page('p3')])
    expect(movePages(d, [], 1)).toBe(d)
    expect(movePages(d, [0], 3)).toBe(d) // to >= n
    expect(movePages(d, [1], 1)).toBe(d) // to está seleccionado
  })
})

describe('deletePages / deletePage', () => {
  it('quita las páginas indicadas', () => {
    const d = doc([page('p1'), page('p2'), page('p3')])
    expect(ids(deletePages(d, [1]))).toEqual(['p1', 'p3'])
    expect(ids(deletePage(d, 0))).toEqual(['p2', 'p3'])
  })

  it('poda los sources que quedaron sin páginas', () => {
    const d = doc(
      [page('p1', 's1'), page('p2', 's1'), page('p3', 's2')],
      [source('s1'), source('s2')],
    )
    const after = deletePage(d, 2) // borra la única página de s2
    expect(after.sources.map((s) => s.id)).toEqual(['s1'])
  })

  it('poda los form fields de páginas borradas', () => {
    const field = (id: string, pageId: string): PdfFormFieldDraft => ({
      id,
      pageId,
      fieldKind: 'text',
      name: id,
      value: '',
      xRatio: 0,
      yRatio: 0,
      wRatio: 0.1,
      hRatio: 0.1,
    })
    const fields = [field('f1', 'p1'), field('f2', 'p2')]
    const d: PdfDoc = { ...doc([page('p1'), page('p2')]), formFields: fields }
    const after = deletePage(d, 0)
    expect(after.formFields?.map((f) => f.id)).toEqual(['f2'])
  })

  it('es no-op con lista vacía o índices que no cambian la longitud', () => {
    const d = doc([page('p1'), page('p2')])
    expect(deletePages(d, [])).toBe(d)
    expect(deletePages(d, [9])).toBe(d)
  })
})

describe('rotatePages / rotatePage', () => {
  it('rota solo las páginas seleccionadas y normaliza a 0..3', () => {
    const d = doc([page('p1'), page('p2')])
    const after = rotatePages(d, [0], 5) // (0+5)%4 = 1
    expect(after.pages[0]!.rotationQuarters).toBe(1)
    expect(after.pages[1]!.rotationQuarters).toBe(0) // intacta
  })

  it('normaliza deltas negativos a 0..3', () => {
    const d = doc([page('p1')])
    expect(rotatePage(d, 0, -1).pages[0]!.rotationQuarters).toBe(3)
  })

  it('es no-op cuando la rotación efectiva no cambia (delta múltiplo de 4)', () => {
    const d = doc([page('p1')])
    expect(rotatePages(d, [0], 4)).toBe(d)
    expect(rotatePages(d, [], 1)).toBe(d)
  })
})

describe('duplicatePages', () => {
  it('inserta una copia justo después de cada página, con id nuevo', () => {
    const d = doc([page('p1'), page('p2')])
    const after = duplicatePages(d, [0])
    expect(after.pages).toHaveLength(3)
    // [p1, copia, p2]
    expect(after.pages[0]!.id).toBe('p1')
    expect(after.pages[2]!.id).toBe('p2')
    const copy = after.pages[1]!
    expect(copy.id).not.toBe('p1')
    expect(copy.sourceId).toBe('s1')
    // todos los ids son únicos
    expect(new Set(ids(after)).size).toBe(after.pages.length)
  })

  it('reasigna los ids de las anotaciones de la copia', () => {
    const ann: Annotation = {
      id: 'a1',
      kind: 'text',
      text: 'hola',
      xRatio: 0,
      yRatio: 0,
      sizeRatio: 0.1,
      color: '#000',
      font: 'sans',
      bold: false,
    }
    const d = doc([page('p1', 's1', 0, [ann])])
    const copy = duplicatePages(d, [0]).pages[1]!
    const a0 = copy.annotations[0]!
    expect(a0.id).not.toBe('a1')
    expect(a0).toMatchObject({ kind: 'text', text: 'hola' }) // contenido preservado
  })

  it('es no-op con lista vacía', () => {
    const d = doc([page('p1')])
    expect(duplicatePages(d, [])).toBe(d)
  })
})

describe('repeatDocPages', () => {
  it('agrega copies-1 bloques completos al final', () => {
    const d = doc([page('p1'), page('p2')])
    const after = repeatDocPages(d, 3) // 2 bloques extra → 6 páginas
    expect(after.pages).toHaveLength(6)
    expect(ids(after).slice(0, 2)).toEqual(['p1', 'p2']) // el original queda igual
    expect(new Set(ids(after)).size).toBe(6) // ids únicos
  })

  it('es no-op con copies <= 1 o documento vacío', () => {
    const d = doc([page('p1')])
    expect(repeatDocPages(d, 1)).toBe(d)
    expect(repeatDocPages(d, 0)).toBe(d)
    const empty = doc([])
    expect(repeatDocPages(empty, 3)).toBe(empty)
  })
})
