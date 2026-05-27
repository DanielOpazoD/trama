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
  chat: 'var(--accent-primary)',
  sugerencias: 'var(--accent-primary)',
}
