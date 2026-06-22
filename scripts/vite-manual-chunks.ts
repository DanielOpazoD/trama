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
