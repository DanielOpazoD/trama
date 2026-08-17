export const PDF_ENTRYPOINT_INVENTORY = [
  {
    id: 'viewer',
    label: 'PDF viewer',
    intent: 'Render, preview and shared PDF.js loading for the PDF Studio route.',
    budget: 720,
    bases: ['PdfStudioView', 'pdf.worker.min', 'vendor-pdfjs'],
    lazyBases: ['PdfStudioView', 'pdf.worker.min', 'pdfjsLoader', 'vendor-pdfjs'],
  },
  {
    id: 'editor',
    label: 'PDF editor',
    intent: 'Text, annotation and page editing surface loaded after page edit intent.',
    budget: 80,
    bases: ['PdfTextEditor'],
    lazyBases: ['PdfTextEditor'],
  },
  {
    id: 'assembleExport',
    label: 'PDF assemble/export',
    intent: 'Write, merge, redact and image-sheet export paths that depend on pdf-lib.',
    budget: 1320,
    bases: ['assemble', 'assembleImages', 'vendor-pdf-lib'],
    lazyBases: [
      'assemble',
      'assembleImages',
      'pdfExport.worker',
      'pdfLibLoader',
      'vendor-pdf-lib',
    ],
  },
  {
    id: 'forms',
    label: 'PDF forms',
    intent: 'AcroForm inspection, fill and flatten flows kept behind user intent.',
    budget: 20,
    bases: ['pdfForms'],
    lazyBases: ['pdfForms', 'pdfLibLoader'],
  },
  {
    id: 'heavyWorker',
    label: 'PDF heavy worker',
    intent: 'Shared router worker for export, forms and OCR heavy operations.',
    budget: 10,
    bases: ['pdfHeavy.worker'],
    lazyBases: ['pdfHeavy.worker'],
  },
  {
    id: 'ocr',
    label: 'PDF OCR',
    intent: 'Searchable PDF generation and OCR worker/runtime chunks.',
    budget: 30,
    bases: ['pdfOcr', 'pdfOcrInput', 'pdfOcrProgress', 'pdfOcrRecognition', 'vendor-ocr'],
    lazyBases: [
      'pdfOcr',
      'pdfOcrInput',
      'pdfOcrProgress',
      'pdfOcrRecognition',
      'vendor-ocr',
    ],
  },
  {
    id: 'stamps',
    label: 'PDF stamps',
    intent: 'Signature and stamp asset library loaded only when the editor asks for it.',
    budget: 40,
    bases: ['StampAssetMenuHost'],
    lazyBases: ['StampAssetMenuHost'],
  },
  {
    id: 'libro',
    label: 'PDF libro',
    intent: 'Libro preview/build helpers that reuse the PDF runtime loaders.',
    budget: 90,
    bases: ['buildLibro', 'libroPreview'],
    lazyBases: ['buildLibro', 'libroPreview', 'pdfjsLoader', 'pdfLibLoader'],
  },
]

export const PDF_ENTRYPOINT_GROUPS = PDF_ENTRYPOINT_INVENTORY.map((entry) => entry.id)

export const PDF_PAYLOAD_BASES = [
  ...new Set(PDF_ENTRYPOINT_INVENTORY.flatMap((entry) => entry.bases)),
]

export const PDF_LAZY_ENTRYPOINT_BASES = [
  ...new Set(PDF_ENTRYPOINT_INVENTORY.flatMap((entry) => entry.lazyBases)),
].sort()

// La duplicación de estos vendors es ESTRUCTURAL, no un descuido de chunking:
// el hilo principal y el Worker son grafos de módulos separados y cada uno
// necesita su copia. Por eso el budget cuenta el par, no cada copia.
//
// `vendor-pdfjs` subió de 250 a 260 KB al actualizar `pdfjs-dist` 6.0.227 →
// 6.2.108, que cierra GHSA-hq66-cqwq-w95j (ejecución arbitraria de JavaScript
// al abrir un PDF malicioso). Son ~2 KB gzip por copia: no se rechaza un parche
// de esa gravedad para conservar un número. Cualquier subida futura de este
// techo necesita una razón escrita igual de concreta.
export const PDF_DUPLICATE_VENDOR_BUDGETS = {
  'vendor-pdf-lib': { maxCount: 2, maxGzKb: 1100 },
  'vendor-pdfjs': { maxCount: 2, maxGzKb: 260 },
  'vendor-ocr': { maxCount: 2, maxGzKb: 15 },
}
