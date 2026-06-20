import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { OfflineContext } from '../../state/offline'
import { ToastProvider } from '../../state/toast'
import { makeQueryClient } from '../../test-utils'

export function createQueryClientHarness(options: { offline?: boolean } = {}) {
  const queryClient = makeQueryClient()
  const offline = options.offline ?? false

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <OfflineContext.Provider value={{ offline, setOffline: () => {} }}>
          <ToastProvider>{children}</ToastProvider>
        </OfflineContext.Provider>
      </QueryClientProvider>
    )
  }

  return { queryClient, wrapper: Wrapper }
}
