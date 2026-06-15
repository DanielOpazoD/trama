/**
 * Deep link al lugar de la app donde quedó la captura, para incluirlo en la
 * confirmación de WhatsApp ("ver en Trama"). Apunta a la VISTA/mundo que
 * contiene el item (la app lee `?view=` y `?world=` al primer render —
 * `useInitialView` / `readWorldDeepLink`); el item exacto no se deep-linkea
 * porque la app aún no rutea por id.
 */
const TARGET_BY_KIND: Record<string, string> = {
  note: '?world=notas',
  quote: '?view=citas',
  entity: '?view=entidades',
  momento: '?view=momentos',
  recorte: '?view=recortes',
  task: '?world=notas&section=tareas',
}

export function captureDeepLink(origin: string, kind: string): string {
  const base = origin.replace(/\/+$/, '')
  return `${base}/${TARGET_BY_KIND[kind] ?? '?view=inicio'}`
}
