/**
 * Fallback de carga mientras baja el chunk (lazy) de un mundo — un indicador
 * discreto sobre papel en vez de una pantalla en blanco. Lo usa el Suspense del
 * mundo Notas en App; la precarga del bundle vive en WorldShell para que, en la
 * práctica, casi nunca se llegue a ver.
 */
export function WorldLoadingFallback() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-paper-50">
      <span className="text-caption text-ink-300 animate-pulse">cargando…</span>
    </div>
  )
}
