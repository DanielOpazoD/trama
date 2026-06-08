import { describe, expect, it, vi } from 'vitest'
import { assertOcrNotCancelled, emitOcrProgress } from './pdfOcrProgress'

describe('pdfStudio/pdfOcrProgress', () => {
  it('lanza AbortError cuando la operación OCR fue cancelada', () => {
    const controller = new AbortController()
    controller.abort()

    expect(() => assertOcrNotCancelled(controller.signal)).toThrow(/cancelada/)
  })

  it('emite progreso solo cuando hay callback', () => {
    const onProgress = vi.fn()
    const progress = { phase: 'prepare' as const, status: 'start' as const }

    emitOcrProgress(undefined, progress)
    emitOcrProgress(onProgress, progress)

    expect(onProgress).toHaveBeenCalledWith(progress)
  })
})
