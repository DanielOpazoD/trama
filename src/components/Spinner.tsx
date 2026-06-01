/**
 * Spinner canónico de Trama — un anillo que gira. Mismo lenguaje que el
 * botón "pensando…" del grafo: anillo tenue (`--accent-primary-ring`) con
 * un arco activo (`--accent-primary`). Para estados de carga donde un
 * skeleton no encaja (carga de vista, blob de imagen en vuelo).
 *
 * Tamaño en px (default 16). El grosor del anillo escala con el tamaño.
 */
export function Spinner({
  size = 16,
  className = '',
}: {
  size?: number
  className?: string
}) {
  return (
    <span
      role="status"
      aria-label="cargando"
      className={`inline-block shrink-0 rounded-full animate-spin ${className}`}
      style={{
        width: size,
        height: size,
        borderWidth: Math.max(2, Math.round(size / 8)),
        borderStyle: 'solid',
        borderColor: 'var(--accent-primary-ring)',
        borderTopColor: 'var(--accent-primary)',
      }}
    />
  )
}
