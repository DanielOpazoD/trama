import { useMemo, useState, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './queryClient'
import { OfflineContext } from './offline'

/**
 * Root provider for the state layer.
 *
 * Wraps TanStack Query's QueryClientProvider and exposes an OfflineContext
 * for the (rare, mostly local-dev) offline mode.
 */
export function Provider({ children }: { children: ReactNode }) {
  const [offline, setOffline] = useState(false)
  const offlineValue = useMemo(() => ({ offline, setOffline }), [offline])

  return (
    <QueryClientProvider client={queryClient}>
      <OfflineContext.Provider value={offlineValue}>{children}</OfflineContext.Provider>
    </QueryClientProvider>
  )
}
