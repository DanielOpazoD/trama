import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'

type ScrollMarginDep = boolean | null | number | string | undefined

/**
 * Virtualizer wired to the app's main scroll container (#main-scroll, set in
 * App.tsx for non-grafo/non-chat views). The trick is `scrollMargin`: the
 * scroll container also holds header/form/etc. content above the list, so we
 * measure the list wrapper's offset and pass it to the virtualizer.
 *
 * Returns:
 *   - listRef:    attach to the wrapper div around the virtual items
 *   - virtualizer: the tanstack/react-virtual instance
 *
 * Usage:
 *   const { listRef, virtualizer } = useMainScrollVirtualizer({
 *     count, estimateSize: 280, overscan: 6,
 *   })
 *
 *   <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
 *     {virtualizer.getVirtualItems().map(v => (
 *       <div
 *         key={v.key}
 *         data-index={v.index}
 *         ref={virtualizer.measureElement}
 *         style={{
 *           position: 'absolute', top: 0, left: 0, right: 0,
 *           transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)`,
 *         }}
 *       >
 *         {renderItem(v.index)}
 *       </div>
 *     ))}
 *   </div>
 */
export function useMainScrollVirtualizer<TElement extends HTMLElement = HTMLDivElement>({
  count,
  estimateSize,
  overscan = 6,
  // Recompute scrollMargin when this changes (e.g., a form above the list opens/closes).
  deps = [],
}: {
  count: number
  estimateSize: number | ((index: number) => number)
  overscan?: number
  deps?: ReadonlyArray<ScrollMarginDep>
}): {
  listRef: MutableRefObject<TElement | null>
  virtualizer: Virtualizer<HTMLElement, Element>
} {
  const listRef = useRef<TElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => document.getElementById('main-scroll'),
    estimateSize: typeof estimateSize === 'function' ? estimateSize : () => estimateSize,
    overscan,
    scrollMargin,
  })

  const scrollMarginDepsKey = JSON.stringify(deps)

  const measureScrollMargin = useCallback(() => {
    if (!listRef.current) return
    const scrollEl = document.getElementById('main-scroll')
    if (!scrollEl) return
    const listRect = listRef.current.getBoundingClientRect()
    const scrollRect = scrollEl.getBoundingClientRect()
    const margin = listRect.top - scrollRect.top + scrollEl.scrollTop
    setScrollMargin(margin)
  }, [])

  useLayoutEffect(() => {
    measureScrollMargin()
  }, [measureScrollMargin, scrollMarginDepsKey])

  return { listRef, virtualizer }
}
