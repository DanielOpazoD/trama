export function createPdfHeavyWorker(): Worker {
  if (typeof Worker === 'undefined') {
    throw new Error('Worker API unavailable')
  }
  return new Worker(new URL('./pdfHeavy.worker.ts', import.meta.url), {
    type: 'module',
    name: 'pdf-heavy-worker',
  })
}
