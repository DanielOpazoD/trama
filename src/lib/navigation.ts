import type { ViewMode } from '../types/view'
import type { NavItem } from '../components/sidebar/NavButton'
import {
  AtlasIcon,
  ChatIcon,
  ConsultasIcon,
  CronologiaIcon,
  EntitiesIcon,
  GraphIcon,
  HomeIcon,
  MomentosIcon,
  MusicIcon,
  QuoteIcon,
  ScissorsIcon,
  SparkleIcon,
  TwitterIcon,
} from '../components/Icons'

/**
 * Registro único de navegación — la fuente de verdad de las vistas top-level.
 * Lo consumen el Sidebar (desktop), la MobileBottomNav y la hoja "Más"
 * (móvil), y sirve de base a ⌘K. Antes esta lista vivía duplicada en Sidebar
 * y MobileBottomNav con órdenes distintos; quitar Flujo del top-level (#205)
 * obligó a editar varios sitios a mano. Centralizarla evita que se
 * desincronicen y hace que sumar/quitar una vista sea UN cambio.
 *
 * Los grupos descomprimen la barra por naturaleza (mismo criterio que tenía
 * el Sidebar):
 *   · Mi trama — lo que acumulás (colecciones)
 *   · Miradas  — lentes sobre el conjunto (Grafo/Cronología/Atlas no son
 *                destinos sueltos, son tres formas de ver lo mismo)
 *   · Diálogo  — superficies de IA
 * 'Inicio' queda suelto arriba. El orden de grupos es el orden de lectura.
 */
export type NavGroup = { label: string | null; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ value: 'inicio', label: 'Inicio', icon: HomeIcon }] },
  {
    label: 'Mi trama',
    items: [
      { value: 'entidades', label: 'Entidades', icon: EntitiesIcon },
      { value: 'citas', label: 'Citas', icon: QuoteIcon },
      { value: 'momentos', label: 'Momentos', icon: MomentosIcon },
      { value: 'recortes', label: 'Recortes', icon: ScissorsIcon },
      { value: 'escuchas', label: 'Escuchas', icon: MusicIcon },
      { value: 'twitter', label: 'Twitter', icon: TwitterIcon },
    ],
  },
  {
    label: 'Miradas',
    items: [
      { value: 'grafo', label: 'Grafo', icon: GraphIcon },
      { value: 'cronologia', label: 'Cronología', icon: CronologiaIcon },
      { value: 'atlas', label: 'Atlas', icon: AtlasIcon },
    ],
  },
  {
    label: 'Diálogo',
    items: [
      { value: 'consultas', label: 'Consultas', icon: ConsultasIcon },
      { value: 'chat', label: 'Chat', icon: ChatIcon },
      { value: 'sugerencias', label: 'Sugerencias', icon: SparkleIcon },
    ],
  },
]

/** Lista plana de todas las vistas navegables, en orden de lectura. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

export function findNavItem(view: ViewMode): NavItem | undefined {
  return NAV_ITEMS.find((i) => i.value === view)
}

/**
 * Vistas primarias de la bottom nav móvil. El resto vive en la hoja "Más".
 * Se mantienen en 4 para que, con el botón "Más", sean 5 slots — el límite
 * cómodo para el pulgar. Antes la barra apretaba 7 ítems (~53px c/u) y, peor,
 * dejaba 5 vistas (Escuchas, Twitter, Cronología, Atlas, Sugerencias)
 * inalcanzables en móvil porque no cabían: "Más" ahora expone TODAS.
 */
export const MOBILE_PRIMARY_VIEWS: ViewMode[] = [
  'inicio',
  'entidades',
  'citas',
  'momentos',
]

export const MOBILE_PRIMARY_ITEMS: NavItem[] = MOBILE_PRIMARY_VIEWS.map((v) =>
  findNavItem(v),
).filter((i): i is NavItem => Boolean(i))

/**
 * Vistas que NO están en la barra primaria — las que abre "Más", agrupadas
 * igual que en el sidebar para conservar el modelo mental del usuario.
 */
export const MOBILE_MORE_GROUPS: NavGroup[] = NAV_GROUPS.map((g) => ({
  label: g.label,
  items: g.items.filter((i) => !MOBILE_PRIMARY_VIEWS.includes(i.value)),
})).filter((g) => g.items.length > 0)

/** Las vistas alcanzables solo desde "Más" (para tests y badges). */
export const MOBILE_MORE_VIEWS: ViewMode[] = MOBILE_MORE_GROUPS.flatMap((g) =>
  g.items.map((i) => i.value),
)
