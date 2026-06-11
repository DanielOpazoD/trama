import { useAuth, useUser } from '@clerk/react'
import { useEffect } from 'react'
import { setApiAuthTokenProvider } from '../api/request'
import { setCurrentClientUser } from '../lib/clientIdentity'

/**
 * Wires Clerk's public useAuth() API into the fetch client without forcing
 * every state hook to become a React hook factory.
 */
export function ApiAuthBridge() {
  const { getToken, userId } = useAuth()
  const { user } = useUser()

  useEffect(() => {
    return setApiAuthTokenProvider(() => getToken())
  }, [getToken])

  useEffect(
    () =>
      setCurrentClientUser({
        userId: userId ?? null,
        label: user?.fullName || user?.username || null,
        email: user?.primaryEmailAddress?.emailAddress ?? null,
      }),
    [userId, user?.fullName, user?.primaryEmailAddress?.emailAddress, user?.username],
  )

  return null
}
