import type { ViewMode } from '../components/Sidebar'

/**
 * λ4: cada vista del shell tiene una firma cromática propia que se
 * aplica a la barra del activo en sidebar/bottom-nav y a la accent
 * band global debajo del TopBar.
 *
 * Las decisiones cromáticas:
 *   Inicio        gold        — saludo cálido, momento de entrada
 *   Grafo         primary     — azul prusia, el mapa
 *   Entidades     persona     — marrón cálido del tipo dominante
 *   Citas         gold        — donde el lenguaje pesa
 *   Momentos      evento      — bronce, marca temporal
 *   Escuchas      musico      — rojo-tierra de "música"
 *   Cronología    sage        — verde sereno, distancia temporal
 *   Atlas         idea        — terracota cálida, el cielo de las constelaciones
 *   Chat          primary     — conversación con la IA
 *   Sugerencias   primary     — la IA propone
 *
 * Los valores son CSS vars (no hex hardcoded) para que cambien
 * automáticamente con el tema (light / dark / vela).
 */
export const SECTION_ACCENT: Record<ViewMode, string> = {
  inicio: 'var(--accent-gold)',
  grafo: 'var(--accent-primary)',
  entidades: 'var(--type-persona)',
  citas: 'var(--accent-gold)',
  momentos: 'var(--type-evento)',
  escuchas: 'var(--type-musico)',
  // Twitter/X — azul prusia del primary, sobrio, no compite con musico.
  twitter: 'var(--accent-primary)',
  cronologia: 'var(--accent-sage)',
  atlas: 'var(--type-idea)',
  chat: 'var(--accent-primary)',
  sugerencias: 'var(--accent-primary)',
  // Gabinete — clay (terracota cálida, libre: ninguna otra sección la usa),
  // el tono lúdico del rincón de los gestos literarios.
  gabinete: 'var(--accent-clay)',
}
