import { describe, expect, it, vi } from 'vitest'
import {
  PdfHeavyOperationError,
  runPdfHeavyOperation,
  type PdfHeavyOperationWorkerMessage,
} from './heavyOperationClient'

class FakeWorker {
  static instances: FakeWorker[] = []

  onmessage: ((event: MessageEvent<PdfHeavyOperationWorkerMessage>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly posted: unknown[] = []
  terminated = false

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(message: unknown) {
    this.posted.push(message)
  }

  terminate() {
    this.terminated = true
  }

  emit(message: PdfHeavyOperationWorkerMessage) {
    this.onmessage?.({ data: message } as MessageEvent<PdfHeavyOperationWorkerMessage>)
  }
}

function lastWorker(): FakeWorker {
  return FakeWorker.instances[FakeWorker.instances.length - 1]!
}

describe('pdfStudio/heavyOperationClient', () => {
  it('resuelve una operacion pesada con progreso y termina el worker dedicado', async () => {
    const progress = vi.fn()
    const promise = runPdfHeavyOperation({
      kind: 'pdf-export',
      payload: { value: 1 },
      createWorker: () => new FakeWorker() as unknown as Worker,
      onProgress: progress,
    })

    const worker = lastWorker()
    const runMessage = worker.posted[0] as { type: 'run'; id: string }
    worker.emit({
      type: 'progress',
      id: runMessage.id,
      kind: 'pdf-export',
      progress: { phase: 'process-pages', status: 'progress', current: 1, total: 2 },
    })
    worker.emit({
      type: 'complete',
      id: runMessage.id,
      kind: 'pdf-export',
      result: { ok: true },
    })

    await expect(promise).resolves.toEqual({ ok: true })
    expect(progress).toHaveBeenCalledWith({
      phase: 'process-pages',
      status: 'progress',
      current: 1,
      total: 2,
    })
    expect(worker.terminated).toBe(true)
  })

  it('cancela una operacion activa con AbortSignal y avisa al worker', async () => {
    const controller = new AbortController()
    const promise = runPdfHeavyOperation({
      kind: 'pdf-export',
      payload: { value: 1 },
      createWorker: () => new FakeWorker() as unknown as Worker,
      signal: controller.signal,
    })

    const worker = lastWorker()
    const runMessage = worker.posted[0] as { type: 'run'; id: string }
    controller.abort()

    await expect(promise).rejects.toMatchObject({
      name: 'PdfHeavyOperationError',
      code: 'CANCELLED',
      message: 'Operación cancelada.',
    })
    expect(worker.posted).toContainEqual({ type: 'cancel', id: runMessage.id })
    expect(worker.terminated).toBe(true)
  })

  it('usa fallback si no se puede crear el worker', async () => {
    const fallback = vi.fn(async () => ({ blob: 'main-thread' }))

    await expect(
      runPdfHeavyOperation({
        kind: 'pdf-export',
        payload: { value: 1 },
        createWorker: () => {
          throw new Error('Worker unavailable')
        },
        fallback,
      }),
    ).resolves.toEqual({ blob: 'main-thread' })

    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('normaliza errores enviados por el worker', async () => {
    const promise = runPdfHeavyOperation({
      kind: 'pdf-export',
      payload: { value: 1 },
      createWorker: () => new FakeWorker() as unknown as Worker,
    })

    const worker = lastWorker()
    const runMessage = worker.posted[0] as { type: 'run'; id: string }
    worker.emit({
      type: 'error',
      id: runMessage.id,
      kind: 'pdf-export',
      error: {
        message: 'sin memoria',
        code: 'SAVE_FAILED',
        phase: 'save',
      },
    })

    await expect(promise).rejects.toBeInstanceOf(PdfHeavyOperationError)
    await expect(promise).rejects.toMatchObject({
      code: 'SAVE_FAILED',
      phase: 'save',
      message: 'sin memoria',
    })
    expect(worker.terminated).toBe(true)
  })
})
