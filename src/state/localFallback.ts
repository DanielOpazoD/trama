import * as demo from '../lib/demo'

/**
 * LocalStorage fallback is only safe in explicit demo mode. In authenticated
 * multi-user mode, showing stale local rows after an API failure can look like
 * user-owned server data when it is not.
 */
export function canUseLocalFallback(): boolean {
  return demo.isDemoMode()
}
