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
    bases: [
      'assemble',
      'assembleImages',
      'html2canvas.esm',
      'jspdf.es.min',
      'vendor-pdf-lib',
    ],
    lazyBases: [
      'assemble',
      'assembleImages',
      'html2canvas.esm',
      'jspdf.es.min',
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

export const PDF_DUPLICATE_VENDOR_BUDGETS = {
  'vendor-pdf-lib': { maxCount: 2, maxGzKb: 1100 },
  'vendor-pdfjs': { maxCount: 2, maxGzKb: 250 },
  'vendor-ocr': { maxCount: 2, maxGzKb: 15 },
}
