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
  // Solo los paquetes `react`, `react-dom` y `scheduler`: el segmento anterior
  // tiene que ser `node_modules`. Con `/react/` a secas, `@clerk/react` caía
  // acá, y como importa `@clerk/shared` (→ query-core, en `vendor-query`) y
  // react-query importa React, los dos chunks se importaban mutuamente.
  // Producción quedó en blanco («t is not a function» en vendor-query): en un
  // ciclo, el segundo en evaluarse ve los `var` del primero sin asignar.
  // `check:chunk-graph` vigila que no vuelva a pasar.
  if (/[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/.test(id)) {
    return 'vendor-react'
  }
  if (id.includes('@tanstack')) {
    return 'vendor-query'
  }
  // sigma y graphology van juntas; si Vite las arrastra al principal, el bundle
  // inicial crece aunque el grafo grande sea una vista lazy.
  // `events` es la dependencia de sigma (EventEmitter para el navegador). Sin
  // nombrarla caía en el chunk de la vista que la usa (GraphCanvasSigma) y
  // vendor-graph la importaba de vuelta: otro ciclo, mismo riesgo.
  if (
    id.includes('sigma') ||
    id.includes('graphology') ||
    /[\\/]node_modules[\\/]events[\\/]/.test(id)
  ) {
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
    // Rolldown arrastra al grupo las dependencias de cada módulo capturado
    // (salvo las que capture un grupo de mayor prioridad). Estuvo en `false`
    // para que `@clerk/react` no se llevara `@tanstack/query-core` a
    // `vendor-react`; pero eso dejaba a las dependencias no nombradas (`events`
    // de sigma, las de mammoth) en el chunk de la vista que las usa, y el
    // vendor las importaba de vuelta: tres ciclos chunk ↔ chunk, y uno
    // (vendor-react ↔ vendor-query, con clerk dentro de vendor-react) dejó
    // producción en blanco. Con `vendor-react` acotado a React de verdad, el
    // valor por defecto es el correcto: cada vendor se lleva lo suyo y el
    // grafo queda acíclico. `check:chunk-graph` lo comprueba en cada build.
    includeDependenciesRecursively: true,
    groups: VENDOR_CHUNK_NAMES.map((name, index) => ({
      name,
      test: (id: string) => manualVendorChunks(id) === name,
      priority: VENDOR_CHUNK_NAMES.length - index,
    })),
  }
}
