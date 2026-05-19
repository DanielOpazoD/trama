/**
 * Helpers to render components under a fresh QueryClient + offline context.
 * Each test gets isolated state.
 */
import { type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import { OfflineContext } from './state/offline'

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // staleTime: Infinity — pre-populated data via setQueryData stays put;
      // no background refetches in tests.
      queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

export function renderWithProviders(
  ui: ReactNode,
  options: {
    queryClient?: QueryClient
    offline?: boolean
    setOffline?: (offline: boolean) => void
  } & Omit<RenderOptions, 'wrapper'> = {},
) {
  const { queryClient = makeQueryClient(), offline = false, setOffline = () => {}, ...rest } = options
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <OfflineContext.Provider value={{ offline, setOffline }}>
          {children}
        </OfflineContext.Provider>
      </QueryClientProvider>
    )
  }
  return { ...render(ui, { wrapper: Wrapper, ...rest }), queryClient }
}
