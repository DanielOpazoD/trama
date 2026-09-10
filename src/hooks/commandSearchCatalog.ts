import { NAV_GROUPS } from '../lib/navigation'
import type { ViewMode } from '../types/view'

/**
 * Catálogo estático del buscador (⌘K): las acciones rápidas y las vistas, cada
 * una con su pista. No puntúa ni filtra: eso lo hace `commandSearchModel.ts`.
 */

export type CommandAction =
  | 'open-settings'
  | 'open-shortcuts'
  | 'open-sortes'
  | 'open-espejo'
  | 'open-careo'
  | 'new-entity'
  | 'new-quote'
  | 'new-momento'

const VIEW_HINTS: Record<ViewMode, string> = {
  inicio: 'entrada a la trama',
  entidades: 'personas, obras y conceptos',
  citas: 'fragmentos guardados',
  momentos: 'notas y escenas del tiempo',
  escuchas: 'música reciente',
  twitter: 'bookmarks de X/Twitter',
  grafo: 'mapa de relaciones',
  cronologia: 'lectura temporal',
  atlas: 'constelaciones temáticas',
  chat: 'conversación con tu archivo',
  sugerencias: 'ronda proactiva de IA',
}

export const VIEWS: Array<{ view: ViewMode; label: string; hint: string }> =
  NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      view: item.value,
      label: item.label,
      hint: group.label
        ? `${group.label} · ${VIEW_HINTS[item.value]}`
        : VIEW_HINTS[item.value],
    })),
  )

export const ACTIONS: Array<{ action: CommandAction; label: string; hint: string }> = [
  {
    action: 'new-entity',
    label: 'Nueva entidad',
    hint: 'crear persona, libro, canción, concepto',
  },
  { action: 'new-quote', label: 'Nueva cita', hint: 'guardar un fragmento' },
  { action: 'new-momento', label: 'Nuevo momento', hint: 'nota, recorte o foto del día' },
  {
    action: 'open-sortes',
    label: 'Atril',
    hint: 'releer el archivo · cita del día · sortes · al azar',
  },
  {
    action: 'open-espejo',
    label: 'Espejo',
    hint: 'la composición de tu trama · tipos, épocas, lo más cruzado',
  },
  {
    action: 'open-careo',
    label: 'Careo',
    hint: 'dos voces frente a frente · citas en doble página',
  },
  {
    action: 'open-settings',
    label: 'Configuración',
    hint: 'preferencias, tema, IA, datos',
  },
  { action: 'open-shortcuts', label: 'Atajos de teclado', hint: 'lista de shortcuts' },
]
