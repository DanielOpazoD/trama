import { describe, expect, it } from 'vitest'

import { manualVendorChunks } from './vite-manual-chunks'

describe('manualVendorChunks', () => {
  it('separa vendors de arranque en chunks cacheables', () => {
    expect(manualVendorChunks('/repo/node_modules/react/index.js')).toBe('vendor-react')
    expect(manualVendorChunks('/repo/node_modules/react-dom/client.js')).toBe(
      'vendor-react',
    )
    expect(manualVendorChunks('/repo/node_modules/@tanstack/react-query/index.js')).toBe(
      'vendor-query',
    )
  })

  it('mantiene graph y PDF fuera del bundle principal', () => {
    expect(manualVendorChunks('/repo/node_modules/sigma/build/index.js')).toBe(
      'vendor-graph',
    )
    expect(manualVendorChunks('/repo/node_modules/graphology/dist/index.js')).toBe(
      'vendor-graph',
    )
    expect(manualVendorChunks('/repo/node_modules/pdf-lib/es/index.js')).toBe(
      'vendor-pdf-lib',
    )
    expect(manualVendorChunks('/repo/node_modules/@pdf-lib/fontkit/index.js')).toBe(
      'vendor-pdf-lib',
    )
    expect(manualVendorChunks('/repo/node_modules/pdfjs-dist/build/pdf.mjs')).toBe(
      'vendor-pdfjs',
    )
    expect(manualVendorChunks('/repo/node_modules/tesseract.js/src/index.js')).toBe(
      'vendor-ocr',
    )
  })

  it('deja los chunks PDF de aplicacion en el grafo lazy natural', () => {
    expect(
      manualVendorChunks('/repo/src/lib/pdfStudio/export/pdfHeavy.worker.ts'),
    ).toBeUndefined()
    expect(
      manualVendorChunks('/repo/src/lib/pdfStudio/assemble/assemble.ts'),
    ).toBeUndefined()
    expect(
      manualVendorChunks('/repo/src/lib/pdfStudio/forms/pdfForms.ts'),
    ).toBeUndefined()
    expect(manualVendorChunks('/repo/src/lib/pdfStudio/ocr/pdfOcr.ts')).toBeUndefined()
  })

  it('aísla el visor de Office (mammoth / xlsx) en chunks lazy propios', () => {
    expect(manualVendorChunks('/repo/node_modules/mammoth/lib/index.js')).toBe(
      'vendor-mammoth',
    )
    // Deps exclusivas de mammoth viajan en el mismo chunk.
    expect(manualVendorChunks('/repo/node_modules/jszip/lib/index.js')).toBe(
      'vendor-mammoth',
    )
    expect(manualVendorChunks('/repo/node_modules/xlsx/xlsx.mjs')).toBe('vendor-xlsx')
    // Deps de (de)serialización binaria de xlsx viajan con él.
    expect(manualVendorChunks('/repo/node_modules/cfb/cfb.js')).toBe('vendor-xlsx')
  })

  it('no fuerza chunks manuales para codigo de aplicacion', () => {
    expect(manualVendorChunks('/repo/src/App.tsx')).toBeUndefined()
  })
})
