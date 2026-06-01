/**
 * Sanitiza paths de observabilidad antes de persistirlos o loguearlos.
 *
 * Estos datos sirven para agrupar fallas y Core Web Vitals; no necesitan
 * query strings ni identificadores reales de entidades del usuario.
 */
export function sanitizeObservedPath(path: string | null | undefined): string | null {
  if (!path || typeof path !== 'string') return null

  const cleanPath = path.split('?')[0] || '/'
  return cleanPath
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d{6,}/g, '/:n')
    .slice(0, 500)
}
