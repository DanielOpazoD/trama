const RELOAD_FLAG = 'trama:stale-asset-reload'

export class StaleAssetLoadError extends Error {
  readonly code = 'STALE_APP_ASSET'
  readonly cause: unknown

  constructor(cause: unknown) {
    super(
      'La aplicación se actualizó mientras esta pestaña seguía abierta. Recarga la página e intenta exportar de nuevo.',
    )
    this.name = 'StaleAssetLoadError'
    this.cause = cause
  }
}

function messageFrom(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : ''
}

export function isStaleAssetLoadError(err: unknown): boolean {
  const message = messageFrom(err).toLowerCase()
  return (
    /failed to fetch dynamically imported module/.test(message) ||
    /error loading dynamically imported module/.test(message) ||
    /importing a module script failed/.test(message) ||
    /chunkloaderror/.test(message)
  )
}

export function requestReloadForStaleAsset(err: unknown): boolean {
  if (!isStaleAssetLoadError(err)) return false
  if (typeof window === 'undefined') return false

  try {
    if (window.sessionStorage.getItem(RELOAD_FLAG) === '1') return false
    window.sessionStorage.setItem(RELOAD_FLAG, '1')
  } catch {
    // Si sessionStorage no está disponible, igual intentamos una sola recarga.
  }

  window.location.reload()
  return true
}

export function staleAssetError(err: unknown): StaleAssetLoadError {
  return new StaleAssetLoadError(err)
}
