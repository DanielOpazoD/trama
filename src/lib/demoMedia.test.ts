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

  it('sirve un PDF mínimo válido para un anexo demo .pdf (para el visor pdf.js)', async () => {
    const response = demoMediaResponse(
      '/api/notas-attachments-file/legacy-single-user/demo-att-1.pdf',
    )
    expect(response?.headers.get('Content-Type')).toBe('application/pdf')
    const bytes = new Uint8Array(await response!.arrayBuffer())
    // Cabecera %PDF y marca de fin %%EOF: pdf.js necesita ambas.
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
    const tail = String.fromCharCode(...bytes.slice(-6))
    expect(tail).toContain('%%EOF')
  })

  it('sirve JSON para un anexo demo .json (visor de texto)', async () => {
    const response = demoMediaResponse(
      '/api/notas-attachments-file/legacy-single-user/demo-other-1.json',
    )
    expect(response?.headers.get('Content-Type')).toBe('application/json')
    const parsed = JSON.parse(await response!.text())
    expect(parsed).toMatchObject({ export: 'trama' })
  })

  it('sirve texto plano para un anexo demo .md (visor de texto)', async () => {
    const response = demoMediaResponse(
      '/api/notas-attachments-file/legacy-single-user/demo-doc-2.md',
    )
    expect(response?.headers.get('Content-Type')).toContain('text/plain')
    expect(await response!.text()).toContain('Borrador de ensayo')
  })
})
