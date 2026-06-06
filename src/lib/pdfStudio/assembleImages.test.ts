import { describe, expect, it } from 'vitest'
import { imageCompressionPolicy, readPngSize } from './assembleImages'

describe('pdfStudio/assembleImages', () => {
  it('configura políticas distintas para exportación optimizada y compatible', () => {
    const balanced = imageCompressionPolicy('balanced')
    const compatibility = imageCompressionPolicy('compatibility')

    expect(balanced.jpegMaxDimension).toBeLessThan(compatibility.jpegMaxDimension)
    expect(balanced.jpegQuality).toBeLessThan(compatibility.jpegQuality)
    expect(balanced.maxLosslessPngPixels).toBeLessThan(compatibility.maxLosslessPngPixels)
  })

  it('detecta PNG gigante desde IHDR sin decodificar la imagen', () => {
    const b = new Uint8Array(24)
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    b.set([0x49, 0x48, 0x44, 0x52], 12)
    b[16] = 0
    b[17] = 0
    b[18] = 0x30
    b[19] = 0
    b[20] = 0
    b[21] = 0
    b[22] = 0x24
    b[23] = 0

    expect(readPngSize(b)).toEqual({ w: 12288, h: 9216 })
  })
})
