import { useMemo } from 'react'
import { useCurrentClientUserId } from './clientIdentity'
import { isDemoMode } from './demo'
import type { VaultScope } from './vaultCrypto'

/**
 * El ámbito del vault de Claves para el usuario actual del navegador. Lo
 * comparten la vista de Claves (para abrirlo) y el panel de Datos (para
 * respaldarlo y restaurarlo): si cada uno lo calculara por su cuenta, un
 * respaldo podría guardarse bajo una clave y buscarse bajo otra.
 */
export function useVaultScope(): VaultScope {
  const currentUserId = useCurrentClientUserId()
  const userId = isDemoMode() ? 'demo' : (currentUserId ?? 'legacy-single-user')
  return useMemo(() => ({ userId }), [userId])
}
