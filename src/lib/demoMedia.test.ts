import { describe, expect, it } from 'vitest'

import { demoMediaResponse } from './demoMedia'

describe('demoMediaResponse', () => {
  it('sirve la foto SVG de Momentos en modo prueba', async () => {
    const response = demoMediaResponse('/api/momentos-file/demo/cuaderno.svg')

    expect(response?.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(await response?.text()).toContain('Cuaderno abierto')
  })

  it('sirve una nota de voz WAV silenciosa para el demo', async () => {
    const response = demoMediaResponse('/api/momentos-file/demo/nota-voz.wav')
    const bytes = new Uint8Array(await response!.arrayBuffer())

    expect(response?.headers.get('Content-Type')).toBe('audio/wav')
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE')
  })

  it('sirve placeholder SVG para anexos demo y null para rutas ajenas', async () => {
    const attachment = demoMediaResponse('/api/notas-attachments-file/demo/key.png')

    expect(attachment?.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(demoMediaResponse('/api/entities')).toBeNull()
  })

  it('sirve placeholder SVG para la imagen de una captura (recorte) demo', async () => {
    const image = demoMediaResponse('/api/recortes-image/demo/captura.svg')

    expect(image?.headers.get('Content-Type')).toBe('image/svg+xml')
  })

  it('sirve placeholder SVG para cualquier foto de Momentos en modo prueba', async () => {
    // PR3: las miniaturas de la Biblioteca usan keys arbitrarias de momentos-media;
    // cualquier key (no solo cuaderno.svg) debe servir un placeholder.
    const image = demoMediaResponse('/api/momentos-file/demo/foto-2.svg')

    expect(image?.headers.get('Content-Type')).toBe('image/svg+xml')
  })
})
