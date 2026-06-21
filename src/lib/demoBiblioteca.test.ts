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
import { routeDemoBiblioteca, routeDemoBibliotecaMutation } from './demoBiblioteca'

function list(params: Record<string, string> = {}) {
  return routeDemoBiblioteca(new URLSearchParams(params))
}

function titles(params: Record<string, string> = {}): string[] {
  return list(params).items.map((i) => i.title)
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
