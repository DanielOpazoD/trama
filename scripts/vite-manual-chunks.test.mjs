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
  })

  it('no fuerza chunks manuales para codigo de aplicacion', () => {
    expect(manualVendorChunks('/repo/src/App.tsx')).toBeUndefined()
  })
})
