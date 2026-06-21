import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ORDEN,
  DEFAULT_VISTA,
  coerceVista,
  fileExtension,
  fileTypeLabel,
  formatByteSize,
  formatCardMeta,
  formatShortDate,
  parseOrden,
  resolveRenamedTitle,
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

  describe('fileTypeLabel', () => {
    it('traduce la familia de archivo a una etiqueta legible', () => {
      expect(fileTypeLabel('pdf')).toBe('PDF')
      expect(fileTypeLabel('image')).toBe('Imagen')
      expect(fileTypeLabel('spreadsheet')).toBe('Hoja de cálculo')
      expect(fileTypeLabel('other')).toBe('Archivo')
    })
  })

  describe('formatCardMeta', () => {
    it('combina etiqueta y tamaño con punto medio', () => {
      expect(formatCardMeta('pdf', 167_936)).toBe('PDF · 164 KB')
    })
    it('omite el tamaño cuando es null (solo la etiqueta)', () => {
      expect(formatCardMeta('image', null)).toBe('Imagen')
    })
  })

  describe('coerceVista', () => {
    it('normaliza el query param a una vista válida', () => {
      expect(coerceVista('cuadricula')).toBe('cuadricula')
      expect(coerceVista('lista')).toBe('lista')
      expect(coerceVista(null)).toBe(DEFAULT_VISTA)
      expect(coerceVista('basura')).toBe(DEFAULT_VISTA)
    })
    it('DEFAULT_VISTA es lista', () => {
      expect(DEFAULT_VISTA).toBe('lista')
    })
  })

  describe('fileExtension', () => {
    it('extrae la extensión con el punto', () => {
      expect(fileExtension('a.pdf')).toBe('.pdf')
      expect(fileExtension('foto.final.JPG')).toBe('.JPG')
    })
    it('devuelve "" cuando no hay extensión real', () => {
      expect(fileExtension('sin-extension')).toBe('')
      expect(fileExtension('.gitignore')).toBe('') // punto inicial no cuenta
      expect(fileExtension('archivo.')).toBe('') // punto final no cuenta
      expect(fileExtension('raro.unaextensionmuylarga')).toBe('') // > 8 chars
    })
  })

  describe('resolveRenamedTitle', () => {
    it('preserva la extensión del original si el usuario la quitó', () => {
      expect(resolveRenamedTitle('a.pdf', 'b')).toBe('b.pdf')
      expect(resolveRenamedTitle('informe.docx', '  resumen ')).toBe('resumen.docx')
    })
    it('respeta la extensión si el usuario la mantuvo o escribió otra', () => {
      expect(resolveRenamedTitle('a.pdf', 'b.pdf')).toBe('b.pdf')
      expect(resolveRenamedTitle('a.pdf', 'b.txt')).toBe('b.txt')
      // Case-insensitive: no duplica si el sufijo coincide ignorando mayúsculas.
      expect(resolveRenamedTitle('a.PDF', 'b.pdf')).toBe('b.pdf')
    })
    it('si el original no tiene extensión, no inventa una', () => {
      expect(resolveRenamedTitle('notas', 'apuntes')).toBe('apuntes')
    })
    it('devuelve "" cuando el nombre queda vacío', () => {
      expect(resolveRenamedTitle('a.pdf', '   ')).toBe('')
      expect(resolveRenamedTitle('a.pdf', '')).toBe('')
    })
  })
})
