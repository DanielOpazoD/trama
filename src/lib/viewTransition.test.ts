import { afterEach, describe, expect, test, vi } from 'vitest'
import { startViewTransition } from './viewTransition'

type TestViewTransition = {
  finished: Promise<void>
  ready: Promise<void>
  updateCallbackDone: Promise<void>
  skipTransition: () => void
}

const originalStartViewTransition = document.startViewTransition

function stubStartViewTransition(transition: TestViewTransition) {
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: vi.fn((callback: () => void) => {
      callback()
      return transition
    }),
  })
}

describe('startViewTransition', () => {
  afterEach(() => {
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: originalStartViewTransition,
    })
    vi.restoreAllMocks()
  })

  test('swallows skipped-transition AbortError rejections from the browser', async () => {
    const finishedCatch = vi.fn((_onRejected: (error: unknown) => void) =>
      Promise.resolve(),
    )
    const transition = {
      finished: {
        catch: finishedCatch,
      } as unknown as Promise<void>,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      skipTransition: vi.fn(),
    }
    stubStartViewTransition(transition)

    expect(() => startViewTransition(() => {})).not.toThrow()
    expect(finishedCatch).toHaveBeenCalledOnce()
    const firstCall = finishedCatch.mock.calls[0]
    expect(firstCall).toBeDefined()
    const onRejected = firstCall![0]
    expect(onRejected).toBeTypeOf('function')
    expect(() =>
      onRejected?.(new DOMException('Transition was skipped', 'AbortError')),
    ).not.toThrow()
  })
})
