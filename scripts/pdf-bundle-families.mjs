const PDF_TOTAL_BASES = [
  'PdfStudioView',
  'assemble',
  'assembleImages',
  'buildLibro',
  'html2canvas.esm',
  'jspdf.es.min',
  'libroPreview',
  'pdf.worker.min',
  'pdfExport.worker',
  'pdfForm.worker',
  'pdfForms',
  'pdfOcr',
  'pdfOcr.worker',
  'pdfOcrInput',
  'pdfOcrProgress',
  'pdfOcrRecognition',
  'vendor-pdf-lib',
  'vendor-pdfjs',
  'vendor-ocr',
]

export const PDF_BUNDLE_FAMILIES = [
  {
    name: 'PDF viewer',
    budget: 760,
    bases: ['PdfStudioView', 'pdf.worker.min', 'vendor-pdfjs'],
  },
  {
    name: 'PDF assemble/export',
    budget: 1900,
    bases: [
      'assemble',
      'assembleImages',
      'html2canvas.esm',
      'jspdf.es.min',
      'pdfExport.worker',
      'vendor-pdf-lib',
    ],
  },
  {
    name: 'PDF OCR',
    budget: 180,
    bases: [
      'pdfOcr',
      'pdfOcr.worker',
      'pdfOcrInput',
      'pdfOcrProgress',
      'pdfOcrRecognition',
      'vendor-ocr',
    ],
  },
  {
    name: 'PDF forms',
    budget: 150,
    bases: ['pdfForm.worker', 'pdfForms'],
  },
  {
    name: 'PDF libro',
    budget: 90,
    bases: ['buildLibro', 'libroPreview'],
  },
]

export const PDF_AGGREGATE_BUDGETS = [
  {
    name: 'PDF lazy payload total',
    // Suma gzip de los chunks/worker PDF lazy. No mide initial path; sí evita
    // que PDF Studio/Imprenta crezcan por duplicación silenciosa entre workers.
    budget: 2450,
    bases: PDF_TOTAL_BASES,
  },
  ...PDF_BUNDLE_FAMILIES,
]
