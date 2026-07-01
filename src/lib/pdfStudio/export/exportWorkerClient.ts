import { runPdfHeavyOperation } from './heavyOperationClient'
import {
  PDF_EXPORT_OPERATION_KIND,
  type PdfExportWorkerPayload,
  type PdfExportWorkerProgress,
} from './exportWorkerContract'
import { createPdfHeavyWorker } from './pdfHeavyWorkerClient'
import { requestReloadForStaleAsset, staleAssetError } from '../../staleAssetRecovery'
import type { PdfDoc } from '../model/model'

type AssembleOptions = import('../assemble/assemble').AssembleOptions
type AssembleResult = import('../assemble/assemble').AssembleResult

export function assemblePdfInWorker(
  doc: PdfDoc,
  options: AssembleOptions = {},
): Promise<AssembleResult> {
  const payload: PdfExportWorkerPayload = {
    doc,
    options: {
      compression: options.compression,
    },
  }

  return runPdfHeavyOperation<
    PdfExportWorkerPayload,
    AssembleResult,
    PdfExportWorkerProgress
  >({
    kind: PDF_EXPORT_OPERATION_KIND,
    payload,
    createWorker: createPdfHeavyWorker,
    signal: options.signal,
    onProgress: options.onProgress,
  }).catch((err: unknown) => {
    // Red de seguridad: el worker puede fallar al CREARSE o al CORRER —
    // p. ej. un navegador sin OffscreenCanvas/convertToBlob no logra codificar
    // imágenes dentro del worker (faltan `document`/`<canvas>`). El main thread
    // siempre tiene canvas, así que reensamblamos ahí. No reintentamos si el
    // usuario canceló la exportación.
    if (options.signal?.aborted) throw err
    return import('../assemble/assemble')
      .then(({ assemble }) => assemble(doc, options))
      .catch((fallbackErr: unknown) => {
        if (requestReloadForStaleAsset(fallbackErr)) throw staleAssetError(fallbackErr)
        throw fallbackErr
      })
  })
}
