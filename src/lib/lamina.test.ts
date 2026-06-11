import { describe, expect, it, vi } from 'vitest'
import { generateCareoLaminaBlob, generateLaminaBlob, laminaFilename } from './lamina'

/**
 * Smoke tests para lamina.ts. La generación real usa Canvas API y
 * fuentes externas (Spectral via Google Fonts) — el ambiente jsdom no
 * tiene fonts ni renderer real, así que solo testeamos que la función
 * intenta dibujar y devuelve un Blob (vía toBlob mockeado).
 */
describe('generateLaminaBlob', () => {
  it('genera un Blob PNG con el contenido provisto', async () => {
    // Mock canvas → context con métodos no-op
    const fillRect = vi.fn()
    const fillText = vi.fn()
    const measureText = vi.fn(() => ({ width: 100 }) as TextMetrics)
    const toBlob = vi.fn((cb: (b: Blob | null) => void) => {
      cb(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))
    })

    const mockCtx = {
      fillRect,
      fillText,
      measureText,
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      fillStyle: '',
      font: '',
      textAlign: '',
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D

    // Solo interceptamos la creación de canvas; otros elementos no se
    // crean durante el test path así que podemos devolver un stub vacío.
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => mockCtx,
          toBlob,
        } as unknown as HTMLCanvasElement
      }
      return {} as HTMLElement
    }) as typeof document.createElement)

    const blob = await generateLaminaBlob(
      {
        text: 'todo enunciado es proceso.',
        attribution: 'Borges',
        source: 'Otras inquisiciones',
        marginalia: 'me persigue hace meses',
      },
      'vela',
    )

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
    expect(fillRect).toHaveBeenCalled() // background paper
    expect(fillText).toHaveBeenCalled() // texto dibujado
    expect(toBlob).toHaveBeenCalled()
  })

  it('rechaza si el Canvas 2D no está disponible', async () => {
    vi.spyOn(document, 'createElement').mockImplementation(
      () =>
        ({
          getContext: () => null,
        }) as unknown as HTMLCanvasElement,
    )

    await expect(
      generateLaminaBlob({ text: 't', attribution: 'A', source: null }),
    ).rejects.toThrow(/Canvas 2D no disponible/)
  })
})

describe('laminaFilename', () => {
  it('slugifica la atribución', () => {
    expect(laminaFilename('María Luisa Bombal')).toBe('lamina-maria-luisa-bombal.png')
  })
  it('cae a "cita" si no queda nada', () => {
    expect(laminaFilename('—')).toBe('lamina-cita.png')
  })
})

describe('generateCareoLaminaBlob', () => {
  it('dibuja las dos voces y devuelve un Blob PNG', async () => {
    const fillRect = vi.fn()
    const fillText = vi.fn()
    const toBlob = vi.fn((cb: (b: Blob | null) => void) => {
      cb(new Blob([new Uint8Array([1])], { type: 'image/png' }))
    })
    const mockCtx = {
      fillRect,
      fillText,
      measureText: vi.fn(() => ({ width: 100 }) as TextMetrics),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      font: '',
      textAlign: '',
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => mockCtx,
          toBlob,
        } as unknown as HTMLCanvasElement
      }
      return {} as HTMLElement
    }) as typeof document.createElement)

    const blob = await generateCareoLaminaBlob(
      {
        left: { name: 'Borges', text: 'el sur' },
        right: { name: 'Cortázar', text: 'la rayuela' },
        relation: 'influye en',
      },
      'night',
    )
    expect(blob.type).toBe('image/png')
    const drawn = fillText.mock.calls.map((c) => String(c[0]))
    expect(drawn.some((t) => t.includes('B O R G E S'.replace(/ /g, ' ')))).toBe(true)
    expect(drawn.some((t) => t.includes('influye en'))).toBe(true)
  })
})
