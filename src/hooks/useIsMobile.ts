import { useEffect, useState } from 'react'

/**
 * Returns true when the viewport width is below the breakpoint (default
 * 768px = Tailwind's md). Listens for resize and orientation changes so
 * the value stays accurate when the device rotates.
 *
 * Used to switch the right detail/proposal panel from a fixed sidebar
 * (desktop) to a bottom-sheet (mobile), and to default the sidebar to
 * collapsed on small screens.
 */
export function useIsMobile(breakpointPx = 768): boolean {
  const getMatch = () =>
    typeof window !== 'undefined' &&
    window.matchMedia(`(max-width: ${breakpointPx - 1}px)`).matches
  const [isMobile, setIsMobile] = useState(getMatch)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    // Safari < 14 still uses addListener; modern uses addEventListener.
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else mq.addListener(handler)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else mq.removeListener(handler)
    }
  }, [breakpointPx])

  return isMobile
}
