import { useAuth } from '@clerk/react'
import { useEffect } from 'react'
import { setApiAuthTokenProvider } from '../api/request'

/**
 * Wires Clerk's public useAuth() API into the fetch client without forcing
 * every state hook to become a React hook factory.
 */
export function ApiAuthBridge() {
  const { getToken } = useAuth()

  useEffect(() => {
    return setApiAuthTokenProvider(() => getToken())
  }, [getToken])

  return null
}
