export type Pdfjs = typeof import('pdfjs-dist')
export type PdfjsDocumentInit = Parameters<Pdfjs['getDocument']>[0]
export type PdfjsLoadingTask = ReturnType<Pdfjs['getDocument']>

let pdfjsPromise: Promise<Pdfjs> | null = null
let workerUrlPromise: Promise<string> | null = null

async function loadPdfjsWorkerUrl(): Promise<string> {
  if (!workerUrlPromise) {
    workerUrlPromise = import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      .then((worker) => worker.default)
      .catch((error: unknown) => {
        workerUrlPromise = null
        throw error
      })
  }
  return workerUrlPromise
}

/**
 * Loads pdf.js once, configures its worker URL, and retries after failed imports.
 */
export async function loadPdfjs(): Promise<Pdfjs> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import('pdfjs-dist'), loadPdfjsWorkerUrl()])
      .then(([pdfjs, workerUrl]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        return pdfjs
      })
      .catch((error: unknown) => {
        pdfjsPromise = null
        throw error
      })
  }
  return pdfjsPromise
}

/**
 * Opens a pdf.js document through the shared loader boundary.
 */
export async function loadPdfjsDocument(
  input: PdfjsDocumentInit,
): Promise<PdfjsLoadingTask> {
  const pdfjs = await loadPdfjs()
  return pdfjs.getDocument(input)
}
