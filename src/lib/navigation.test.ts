import { describe, it, expect } from 'vitest'
import {
  NAV_GROUPS,
  NAV_ITEMS,
  MOBILE_PRIMARY_VIEWS,
  MOBILE_PRIMARY_ITEMS,
  MOBILE_MORE_GROUPS,
  MOBILE_MORE_VIEWS,
  findNavItem,
} from './navigation'
import { SECTION_ACCENT } from './sectionAccent'
import type { ViewMode } from '../types/view'

const ALL_VIEW_MODES: ViewMode[] = [
  'inicio',
  'entidades',
  'citas',
  'momentos',
  'escuchas',
  'twitter',
  'grafo',
  'cronologia',
  'atlas',
  'chat',
  'sugerencias',
]

describe('registro de navegación', () => {
  it('no tiene vistas duplicadas', () => {
    const values = NAV_ITEMS.map((i) => i.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('registra exactamente todas las ViewMode top-level navegables', () => {
    expect(NAV_ITEMS.map((item) => item.value)).toEqual(ALL_VIEW_MODES)
  })

  it('las vistas primarias existen en el registro', () => {
    for (const v of MOBILE_PRIMARY_VIEWS) {
      expect(findNavItem(v)).toBeDefined()
    }
    // y todas resolvieron a un item
    expect(MOBILE_PRIMARY_ITEMS).toHaveLength(MOBILE_PRIMARY_VIEWS.length)
  })

  it('primarias + "Más" particionan TODAS las vistas (sin solape ni huecos)', () => {
    const all = new Set(NAV_ITEMS.map((i) => i.value))
    const partition = new Set([...MOBILE_PRIMARY_VIEWS, ...MOBILE_MORE_VIEWS])
    expect(partition).toEqual(all)
    // sin solape
    const overlap = MOBILE_PRIMARY_VIEWS.filter((v) => MOBILE_MORE_VIEWS.includes(v))
    expect(overlap).toEqual([])
  })

  it('cada vista del registro tiene un color de sección', () => {
    for (const item of NAV_ITEMS) {
      expect(SECTION_ACCENT[item.value]).toBeTruthy()
    }
  })

  it('mantiene 5 slots en móvil (4 primarias + Más)', () => {
    // Contrato de diseño: la barra no debe volver a apretar 7 ítems.
    expect(MOBILE_PRIMARY_VIEWS).toHaveLength(4)
  })

  it('Inicio es la primera vista y vive suelto (grupo sin label)', () => {
    expect(NAV_GROUPS[0]?.label).toBeNull()
    expect(NAV_GROUPS[0]?.items[0]?.value).toBe('inicio')
  })

  it('modela Catálogo y Lentes como grupos semánticos, no como cajones genéricos', () => {
    expect(NAV_GROUPS.map((group) => group.label)).toEqual([
      null,
      'Catálogo',
      'Lentes',
      'Diálogo',
    ])
    expect(
      NAV_GROUPS.find((group) => group.label === 'Lentes')?.items.map((i) => i.value),
    ).toEqual(['grafo', 'cronologia', 'atlas'])
  })

  it('la hoja móvil Más conserva los mismos grupos semánticos sin primarias', () => {
    expect(
      MOBILE_MORE_GROUPS.map((group) => [group.label, group.items.map((i) => i.value)]),
    ).toEqual([
      ['Catálogo', ['escuchas', 'twitter']],
      ['Lentes', ['grafo', 'cronologia', 'atlas']],
      ['Diálogo', ['chat', 'sugerencias']],
    ])
  })
})
