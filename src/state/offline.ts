import { createContext, useContext } from 'react'

export type OfflineContextValue = {
  offline: boolean
  setOffline: (offline: boolean) => void
}

export const OfflineContext = createContext<OfflineContextValue>({
  offline: false,
  setOffline: () => {},
})

export function useOffline(): OfflineContextValue {
  return useContext(OfflineContext)
}
