import { useMemo, useState, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './queryClient'
import { OfflineContext } from './offline'
import { ToastProvider } from './toast'

/**
 * Root provider for the state layer.
 *
 * Wraps TanStack Query's QueryClientProvider, expone OfflineContext
 * (modo local) y ToastProvider (notificaciones efímeras, undo, etc.).
 */
export function Provider({ children }: { children: ReactNode }) {
  const [offline, setOffline] = useState(false)
  const offlineValue = useMemo(() => ({ offline, setOffline }), [offline])

  return (
    <QueryClientProvider client={queryClient}>
      <OfflineContext.Provider value={offlineValue}>
        <ToastProvider>{children}</ToastProvider>
      </OfflineContext.Provider>
    </QueryClientProvider>
  )
}
