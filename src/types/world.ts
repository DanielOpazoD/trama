/**
 * `World` — los "mundos" de Trama. Cada mundo es un workspace propio con su
 * sub-barra y sus paneles; el riel de la izquierda (WorldRail) conmuta entre
 * ellos. Son independientes (datos separados) pero pueden comunicarse con
 * puentes explícitos (p. ej. "Promover una nota a Momento").
 *
 *   - 'trama' — el mapa cognitivo: entidades, citas, momentos, miradas… (el
 *               mundo histórico; todo lo que existía antes vive acá).
 *   - 'notas' — Trama Notas: apuntes rápidos (memos) + tareas. App de
 *               productividad liviana, estilo usememos.
 *
 * Para agregar un mundo nuevo: sumar el slug acá, su entrada en WORLDS
 * (WorldRail) y el branch correspondiente en WorldShell.
 */
export type World = 'trama' | 'notas'

export const DEFAULT_WORLD: World = 'trama'

/** localStorage key del mundo activo (persiste entre recargas). */
export const WORLD_STORAGE_KEY = 'trama:world'
