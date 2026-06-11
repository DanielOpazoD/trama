import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { buildLibroPdf } from './buildLibro'
import type { Entity, Quote } from '../../types'

/**
 * Test de ejecución REAL del compositor: pdf-lib + fontkit corren en node,
 * y las WOFF vendoreadas se sirven desde disco stubbeando fetch (en vitest
 * los imports `?url` resuelven a la ruta del asset). El resultado se
 * vuelve a abrir con pdf-lib para verificar la estructura de la edición.
 */

const FONTS_DIR = join(__dirname, '../pdfStudio/fonts')

function entity(id: string, name: string, year?: number): Entity {
  return {
    id,
    type: 'escritor',
    name,
    ...(year ? { year } : {}),
    origin: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Entity
}

function quote(
  id: string,
  entityId: string,
  text: string,
  opts: { source?: string; userReflection?: string; createdAt?: string } = {},
): Quote {
  return {
    id,
    entityId,
    text,
    ...(opts.source ? { source: opts.source } : {}),
    ...(opts.userReflection ? { userReflection: opts.userReflection } : {}),
    linkedQuoteIds: [],
    origin: { kind: 'manual' },
    createdAt: opts.createdAt ?? '2025-03-01T12:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | Request | URL) => {
      const file = basename(String(url))
      const bytes = readFileSync(join(FONTS_DIR, file))
      return new Response(bytes, { status: 200 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildLibroPdf', () => {
  it('compone una edición completa: portada, colofón, capítulos e índice', async () => {
    const entities = [entity('a', 'Borges', 1899), entity('b', 'Cortázar')]
    const quotes = [
      quote('q1', 'a', 'Siempre imaginé que el Paraíso sería algún tipo de biblioteca.', {
        source: 'El libro de arena',
        userReflection: 'la biblioteca como destino',
      }),
      quote(
        'q2',
        'a',
        'Uno no es lo que es por lo que escribe, sino por lo que ha leído.',
      ),
      quote(
        'q3',
        'b',
        'Andábamos sin buscarnos pero sabiendo que andábamos para encontrarnos.',
        {
          source: 'Rayuela',
        },
      ),
    ]
    const steps: string[] = []
    const bytes = await buildLibroPdf(
      entities,
      quotes,
      { title: 'Florilegio de prueba', author: 'Daniel', includeMarginalia: true },
      (s) => steps.push(s),
    )

    // Es un PDF de verdad.
    expect(bytes.length).toBeGreaterThan(1000)
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')

    // Reabrimos la edición: portada + colofón + ≥1 página de capítulos +
    // índice = al menos 4 páginas, en A5.
    const { PDFDocument } = await import('pdf-lib')
    const reopened = await PDFDocument.load(bytes)
    expect(reopened.getPageCount()).toBeGreaterThanOrEqual(4)
    const [w, h] = [reopened.getPage(0).getWidth(), reopened.getPage(0).getHeight()]
    expect(Math.round(w)).toBe(420)
    expect(Math.round(h)).toBe(595)
    expect(reopened.getTitle()).toBe('Florilegio de prueba')

    // El progreso narró las etapas.
    expect(steps).toContain('componiendo la portada…')
    expect(steps).toContain('cerrando con el índice…')
  })

  it('una cita más larga que la página fluye partida en varias páginas', async () => {
    const entities = [entity('a', 'Voz única')]
    const longText = Array.from(
      { length: 120 },
      (_, i) => `frase número ${i + 1} de una cita interminable`,
    ).join(', ')
    const bytes = await buildLibroPdf(entities, [quote('q1', 'a', longText)], {
      title: 'Edición larga',
      author: null,
      includeMarginalia: false,
    })
    const { PDFDocument } = await import('pdf-lib')
    const reopened = await PDFDocument.load(bytes)
    // Portada + colofón + ≥2 páginas de capítulo + índice.
    expect(reopened.getPageCount()).toBeGreaterThanOrEqual(5)
  })
})
