import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ORDEN,
  formatByteSize,
  formatShortDate,
  parseOrden,
  toggleOrden,
} from './helpers'

describe('biblioteca/helpers', () => {
  describe('parseOrden', () => {
    it('descompone columna y dirección', () => {
      expect(parseOrden('modificado-desc')).toEqual({
        column: 'modificado',
        direction: 'desc',
      })
      expect(parseOrden('nombre-asc')).toEqual({ column: 'nombre', direction: 'asc' })
      expect(parseOrden('tamano-asc')).toEqual({ column: 'tamano', direction: 'asc' })
    })
  })

  describe('toggleOrden', () => {
    it('alterna asc↔desc al reclickear la columna activa', () => {
      expect(toggleOrden('modificado-desc', 'modificado')).toBe('modificado-asc')
      expect(toggleOrden('modificado-asc', 'modificado')).toBe('modificado-desc')
    })

    it('arranca en dirección natural al cambiar de columna', () => {
      // nombre → A→Z (asc); modificado/tamaño → más reciente/grande (desc)
      expect(toggleOrden('modificado-desc', 'nombre')).toBe('nombre-asc')
      expect(toggleOrden('nombre-asc', 'modificado')).toBe('modificado-desc')
      expect(toggleOrden('nombre-asc', 'tamano')).toBe('tamano-desc')
    })
  })

  describe('formatByteSize', () => {
    it('formatea null como guion', () => {
      expect(formatByteSize(null)).toBe('—')
    })
    it('usa B / KB / MB según la escala', () => {
      expect(formatByteSize(512)).toBe('512 B')
      expect(formatByteSize(2048)).toBe('2 KB')
      expect(formatByteSize(1_572_864)).toBe('1.5 MB')
    })
  })

  describe('formatShortDate', () => {
    it('produce una fecha corta en español', () => {
      // 2026-06-19 → "19 jun" (es). Normalizamos para no atarnos al punto final.
      const out = formatShortDate('2026-06-19T10:00:00.000Z')
      expect(out).toMatch(/19/)
      expect(out.toLowerCase()).toContain('jun')
    })
    it('devuelve cadena vacía ante fecha inválida', () => {
      expect(formatShortDate('no-es-fecha')).toBe('')
    })
  })

  it('DEFAULT_ORDEN es modificado-desc', () => {
    expect(DEFAULT_ORDEN).toBe('modificado-desc')
  })
})
