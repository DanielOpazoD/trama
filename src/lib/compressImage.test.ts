import { describe, it, expect } from 'vitest'
import { compressImageForUpload } from './compressImage'

function fileOf(bytes: number, type: string, name: string): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

describe('compressImageForUpload', () => {
  it('deja pasar lo que no es imagen, sin tocar', async () => {
    const f = fileOf(10 * 1024 * 1024, 'application/pdf', 'doc.pdf')
    expect(await compressImageForUpload(f)).toBe(f)
  })

  it('deja pasar imágenes por debajo del umbral', async () => {
    const f = fileOf(1 * 1024 * 1024, 'image/jpeg', 'foto.jpg')
    expect(await compressImageForUpload(f)).toBe(f)
  })

  it('no recodifica SVG ni GIF aunque sean grandes', async () => {
    const svg = fileOf(8 * 1024 * 1024, 'image/svg+xml', 'a.svg')
    const gif = fileOf(8 * 1024 * 1024, 'image/gif', 'a.gif')
    expect(await compressImageForUpload(svg)).toBe(svg)
    expect(await compressImageForUpload(gif)).toBe(gif)
  })

  it('sin createImageBitmap (entorno de test) devuelve el original', async () => {
    // jsdom no implementa createImageBitmap/canvas.toBlob, así que el guard (o el
    // catch) deja pasar el original — la subida luego mostraría el error de tamaño.
    const f = fileOf(8 * 1024 * 1024, 'image/jpeg', 'grande.jpg')
    expect(await compressImageForUpload(f)).toBe(f)
  })
})
