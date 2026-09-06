export function manualVendorChunks(id: string) {
  // Módulos virtuales de Vite (`\0vite/preload-helper`, etc.). Con rolldown
  // (Vite 8) el helper `__vitePreload` es compartido por TODOS los imports
  // dinámicos y, si no se le da chunk propio, acaba dentro del primer chunk
  // manual que lo toca —fue `vendor-pdfjs`— y cada vista arrastra pdf.js a la
  // carga inicial. Medido: `check:pdf-lazy-entrypoints` en rojo sin esto.
  if (id.includes('\0vite/') || id.includes('vite/preload-helper')) {
    return 'vite-runtime'
  }
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
  if (id.includes('pdfjs-dist')) {
    return 'vendor-pdfjs'
  }
  if (id.includes('tesseract.js')) {
    return 'vendor-ocr'
  }
  // mammoth (.docx → HTML) y sus deps de descompresión/XML. Solo se alcanza por
  // el import dinámico de BibliotecaOfficeViewer; nombrarlo le da un chunk lazy
  // estable (presupuestado) en vez de un `index-*` que choque con el bundle.
  if (
    id.includes('mammoth') ||
    /[\\/](?:jszip|@xmldom[\\/]xmldom|lop|dingbat-to-unicode|xmlbuilder)[\\/]/.test(id)
  ) {
    return 'vendor-mammoth'
  }
  // xlsx/SheetJS (.xlsx/.xls → HTML) y sus deps de (de)serialización binaria.
  if (
    id.includes('xlsx') ||
    /[\\/](?:cfb|codepage|crc-32|adler-32|ssf|wmf)[\\/]/.test(id)
  ) {
    return 'vendor-xlsx'
  }
  return undefined
}

/** Nombres de chunk que `manualVendorChunks` puede devolver, en orden de prioridad. */
export const VENDOR_CHUNK_NAMES = [
  'vite-runtime',
  'vendor-react',
  'vendor-query',
  'vendor-graph',
  'vendor-pdf-lib',
  'vendor-pdfjs',
  'vendor-ocr',
  'vendor-mammoth',
  'vendor-xlsx',
] as const

/**
 * La misma tabla, en la forma que entiende rolldown (Vite 8): `advancedChunks`
 * con un grupo por nombre. La capa de compatibilidad de `manualChunks` no
 * respetaba la asignación de los módulos virtuales de Vite y el helper
 * `__vitePreload` acababa dentro de `vendor-pdfjs`, arrastrando pdf.js a la
 * carga inicial. Con grupos explícitos y prioridad, cada módulo cae donde la
 * tabla dice.
 */
export function advancedVendorChunks() {
  return {
    // Rollup asignaba por id y nada más. Rolldown, por defecto, arrastra al
    // grupo también las dependencias de cada módulo capturado
    // (`includeDependenciesRecursively: true`): así `@clerk/react` se llevaba
    // `@tanstack/query-core` a `vendor-react` (+12 KB) en vez de dejarlo en
    // `vendor-query`. Apagado, cada módulo cae donde su propio id dice.
    includeDependenciesRecursively: false,
    groups: VENDOR_CHUNK_NAMES.map((name, index) => ({
      name,
      test: (id: string) => manualVendorChunks(id) === name,
      priority: VENDOR_CHUNK_NAMES.length - index,
    })),
  }
}
