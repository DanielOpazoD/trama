export function manualVendorChunks(id: string) {
  if (!id.includes('node_modules')) return undefined
  if (id.includes('react-dom') || id.match(/[\\/]react[\\/]/)) {
    return 'vendor-react'
  }
  if (id.includes('@tanstack')) {
    return 'vendor-query'
  }
  // sigma y graphology van juntas; si Vite las arrastra al principal, el bundle
  // inicial crece aunque el grafo grande sea una vista lazy.
  if (id.includes('sigma') || id.includes('graphology')) {
    return 'vendor-graph'
  }
  // pdf-lib y fontkit son bordes lazy de Imprenta/Libro. Nombrarlos evita que
  // Vite emita chunks `index-*` que colisionen con el budget del bundle inicial.
  if (id.includes('pdf-lib') || id.includes('@pdf-lib')) {
    return 'vendor-pdf-lib'
  }
  return undefined
}
