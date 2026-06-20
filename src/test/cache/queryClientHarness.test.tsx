import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useToast } from '../../state/toast'
import { createQueryClientHarness } from './queryClientHarness'

describe('query client test harness', () => {
  it('creates isolated query clients and a hook wrapper with toast context', () => {
    const first = createQueryClientHarness()
    const second = createQueryClientHarness()

    first.queryClient.setQueryData(['contract'], 'first')

    expect(first.queryClient.getQueryData(['contract'])).toBe('first')
    expect(second.queryClient.getQueryData(['contract'])).toBeUndefined()

    const { result } = renderHook(() => useToast(), { wrapper: first.wrapper })
    expect(result.current.show).toEqual(expect.any(Function))
    expect(result.current.dismiss).toEqual(expect.any(Function))
    expect(result.current.current).toBeNull()
  })
})
