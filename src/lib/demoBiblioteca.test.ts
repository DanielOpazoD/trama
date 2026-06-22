/**
 * PR4 — modo prueba: las acciones de la Biblioteca (renombrar / papelera /
 * restaurar) contra la capa de overrides en memoria, y su efecto en el listado
 * (lista normal vs. `incluyeEliminados`).
 *
 * El estado de overrides vive en el módulo, así que los tests resetean usando
 * las propias mutaciones (restaurar / renombrar de vuelta) para no acoplarse a
 * internals.
 */
import { describe, it, expect } from 'vitest'
import {
  routeDemoBiblioteca,
  routeDemoBibliotecaLinks,
  routeDemoBibliotecaMutation,
  routeDemoLibraryUpload,
  routeDemoLibraryUploadPresign,
  routeDemoLibraryUploadComplete,
  type DemoLibraryLinkRow,
  type DemoTargetResolver,
} from './demoBiblioteca'

function list(params: Record<string, string> = {}) {
  return routeDemoBiblioteca(new URLSearchParams(params))
}

function titles(params: Record<string, string> = {}): string[] {
  return list(params).items.map((i) => i.title)
}

function findItem(itemId: string, params: Record<string, string> = {}) {
  return list(params).items.find((i) => i.item_id === itemId)
}

/** Resolutor de títulos de juguete para los tests de conexiones. */
const resolve: DemoTargetResolver = (kind, id) => `${kind}:${id}`

function links(
  method: string,
  kind: string,
  itemId: string,
  params: Record<string, string> = {},
  body: Record<string, unknown> = {},
) {
  return routeDemoBibliotecaLinks(
    method,
    kind,
    itemId,
    new URLSearchParams(params),
    body,
    resolve,
  )
}

function linkList(kind: string, itemId: string): DemoLibraryLinkRow[] {
  return (links('GET', kind, itemId) as { links: DemoLibraryLinkRow[] }).links
}

describe('demoBiblioteca — mutaciones (modo prueba)', () => {
  it('renombrar pisa el título en la lista', () => {
    routeDemoBibliotecaMutation('notas-attachment', 'demo-att-1', {
      displayTitle: 'Contrato renombrado.pdf',
    })
    expect(titles()).toContain('Contrato renombrado.pdf')
    expect(titles()).not.toContain('Contrato de edición.pdf')
    // Restaurar el nombre para no contaminar otros tests.
    routeDemoBibliotecaMutation('notas-attachment', 'demo-att-1', {
      displayTitle: 'Contrato de edición.pdf',
    })
  })

  it('eliminar oculta de la lista normal y lo muestra en la papelera', () => {
    const before = list().items.length
    routeDemoBibliotecaMutation('pdf-saved', 'demo-pdf-1', { deleted: true })

    const normal = list()
    expect(normal.items.length).toBe(before - 1)
    expect(normal.items.some((i) => i.item_id === 'demo-pdf-1')).toBe(false)

    const trash = list({ incluyeEliminados: 'true' })
    expect(trash.items.some((i) => i.item_id === 'demo-pdf-1')).toBe(true)

    // Restaurar deja todo como estaba.
    routeDemoBibliotecaMutation('pdf-saved', 'demo-pdf-1', { deleted: false })
    expect(list().items.length).toBe(before)
    expect(list({ incluyeEliminados: 'true' }).items).toHaveLength(0)
  })

  it('la papelera arranca vacía', () => {
    expect(list({ incluyeEliminados: 'true' }).items).toHaveLength(0)
  })

  it('mutación devuelve { ok: true }', () => {
    expect(
      routeDemoBibliotecaMutation('pdf-saved', 'demo-pdf-1', { deleted: false }),
    ).toEqual({ ok: true })
  })
})

describe('demoBiblioteca — etiquetas y fijar (PR-C)', () => {
  it('reemplaza las etiquetas del item en la lista', () => {
    routeDemoBibliotecaMutation('notas-attachment', 'demo-att-1', {
      tags: ['contratos', 'pendiente'],
    })
    expect(findItem('demo-att-1')?.tags).toEqual(['contratos', 'pendiente'])
    // Restaurar (vacío) para no contaminar otros tests.
    routeDemoBibliotecaMutation('notas-attachment', 'demo-att-1', { tags: [] })
    expect(findItem('demo-att-1')?.tags).toEqual([])
  })

  it('sanea etiquetas: recorta y descarta vacías', () => {
    routeDemoBibliotecaMutation('notas-attachment', 'demo-att-1', {
      tags: ['  lectura  ', '', '   '],
    })
    expect(findItem('demo-att-1')?.tags).toEqual(['lectura'])
    routeDemoBibliotecaMutation('notas-attachment', 'demo-att-1', { tags: [] })
  })

  it('los items fijados van primero, sin importar el orden', () => {
    // demo-pdf-1 ya está fijado en el seed. Fijamos también demo-other-1.
    routeDemoBibliotecaMutation('notas-attachment', 'demo-other-1', { pinned: true })
    // Orden por nombre ascendente: aun así los dos fijados encabezan la lista.
    const ids = list({ orden: 'nombre-asc' }).items.map((i) => i.item_id)
    expect(ids.slice(0, 2).sort()).toEqual(['demo-other-1', 'demo-pdf-1'])
    // Soltar para dejar el seed como estaba.
    routeDemoBibliotecaMutation('notas-attachment', 'demo-other-1', { pinned: false })
    expect(findItem('demo-other-1')?.pinned).toBe(false)
  })
})

describe('demoBiblioteca — conexiones (PR-C)', () => {
  it('siembra una conexión pre-existente en el PDF fijado', () => {
    const seeded = linkList('pdf-saved', 'demo-pdf-1')
    expect(seeded).toHaveLength(1)
    expect(seeded[0]).toMatchObject({
      targetKind: 'entidad',
      targetId: 'e-borges',
      targetTitle: 'entidad:e-borges',
    })
  })

  it('agrega, lista y quita un vínculo (idempotente)', () => {
    const before = linkList('notas-attachment', 'demo-doc-1').length

    links(
      'POST',
      'notas-attachment',
      'demo-doc-1',
      {},
      {
        targetKind: 'nota',
        targetId: 'n-1',
      },
    )
    // Repetir el mismo destino NO duplica.
    links(
      'POST',
      'notas-attachment',
      'demo-doc-1',
      {},
      {
        targetKind: 'nota',
        targetId: 'n-1',
      },
    )
    const after = linkList('notas-attachment', 'demo-doc-1')
    expect(after).toHaveLength(before + 1)
    expect(after[after.length - 1]).toMatchObject({
      targetKind: 'nota',
      targetId: 'n-1',
      targetTitle: 'nota:n-1',
    })

    // Quitar por targetKind + targetId.
    links('DELETE', 'notas-attachment', 'demo-doc-1', {
      targetKind: 'nota',
      targetId: 'n-1',
    })
    expect(linkList('notas-attachment', 'demo-doc-1')).toHaveLength(before)
  })

  it('POST y DELETE devuelven { ok: true }', () => {
    expect(
      links(
        'POST',
        'momento-foto',
        'demo-img-2',
        {},
        {
          targetKind: 'momento',
          targetId: 'm-1',
        },
      ),
    ).toEqual({ ok: true })
    expect(
      links('DELETE', 'momento-foto', 'demo-img-2', {
        targetKind: 'momento',
        targetId: 'm-1',
      }),
    ).toEqual({ ok: true })
  })

  it('resuelve targetTitle en cada lectura (no devuelve el guardado)', () => {
    // Resolutor MUTABLE: simula que el destino se renombra (y luego se borra →
    // null) entre dos lecturas. El GET debe reflejar el valor ACTUAL, igual que
    // el JOIN de prod, no el título fijado al crear el vínculo.
    let current: string | null = 'Borges'
    const dyn = (
      method: string,
      kind: string,
      itemId: string,
      params: Record<string, string> = {},
      body: Record<string, unknown> = {},
    ) =>
      routeDemoBibliotecaLinks(
        method,
        kind,
        itemId,
        new URLSearchParams(params),
        body,
        () => current,
      )
    const read = (kind: string, itemId: string) =>
      (dyn('GET', kind, itemId) as { links: DemoLibraryLinkRow[] }).links

    dyn(
      'POST',
      'pdf-saved',
      'demo-recompute',
      {},
      { targetKind: 'entidad', targetId: 'e-z' },
    )
    expect(read('pdf-saved', 'demo-recompute')[0]?.targetTitle).toBe('Borges')

    current = 'Jorge Luis Borges' // el destino se renombró
    expect(read('pdf-saved', 'demo-recompute')[0]?.targetTitle).toBe('Jorge Luis Borges')

    current = null // el destino se borró → null (la UI cae a "(sin título)")
    expect(read('pdf-saved', 'demo-recompute')[0]?.targetTitle).toBeNull()

    dyn('DELETE', 'pdf-saved', 'demo-recompute', {
      targetKind: 'entidad',
      targetId: 'e-z',
    })
  })
})

describe('demoBiblioteca — subida (modo prueba)', () => {
  it('subir devuelve items camelCase y aparecen en la lista', () => {
    const res = routeDemoLibraryUpload([
      { name: 'apunte nuevo.pdf', mime: 'application/pdf', size: 1234 },
    ])
    expect(res.items).toHaveLength(1)
    const item = res.items[0]!
    expect(item.kind).toBe('library-upload')
    expect(item.title).toBe('apunte nuevo.pdf')
    expect(item.fileType).toBe('pdf')
    expect(item.source).toBe('subido')
    expect(item.storageDomain).toBe('library-uploads')
    // El item recién subido aparece en el listado (lo antepone).
    expect(titles()).toContain('apunte nuevo.pdf')
  })

  it('usa takenAt como created_at cuando llega', () => {
    const takenAt = '2019-03-21T08:30:00.000Z'
    const res = routeDemoLibraryUpload([
      { name: 'foto.jpg', mime: 'image/jpeg', size: 9000, takenAt },
    ])
    expect(res.items[0]!.createdAt).toBe(takenAt)
    // Sin takenAt cae a "ahora" (no explota ni queda vacío).
    const res2 = routeDemoLibraryUpload([
      { name: 'otra.png', mime: 'image/png', size: 10 },
    ])
    expect(Number.isNaN(new Date(res2.items[0]!.createdAt).getTime())).toBe(false)
  })

  it('clasifica el file_type por mime (imagen / documento)', () => {
    const res = routeDemoLibraryUpload([
      { name: 'a.jpg', mime: 'image/jpeg', size: 1 },
      {
        name: 'b.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 2,
      },
    ])
    expect(res.items.map((i) => i.fileType)).toEqual(['image', 'document'])
  })

  it('directo a R2: complete preserva la storageKey presignada (round-trip)', () => {
    const { storageKey } = routeDemoLibraryUploadPresign({ fileName: 'video.mp4' })
    expect(storageKey).toBeTruthy()
    // El endpoint real materializa el manifest con la key del body; el demo
    // debe espejarlo en vez de inventar una nueva.
    const { item } = routeDemoLibraryUploadComplete({
      storageKey,
      fileName: 'video.mp4',
      mimeType: 'video/mp4',
      byteSize: 12_000_000,
    })
    expect(item.storageKey).toBe(storageKey)
    expect(item.kind).toBe('library-upload')
    expect(item.byteSize).toBe(12_000_000)
  })

  it('directo a R2: complete sin storageKey válida genera una (no rompe)', () => {
    const { item } = routeDemoLibraryUploadComplete({
      fileName: 'suelto.pdf',
      mimeType: 'application/pdf',
      byteSize: 50,
    })
    expect(item.storageKey).toMatch(/^legacy-single-user\//)
  })
})
