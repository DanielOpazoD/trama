import { CalendarHeatmap } from '../CalendarHeatmap'
import type { Entity, Quote, Relationship } from '../../types'

/**
 * G2 (FF3-c) — wrapper de `CalendarHeatmap` para HomeView: aplica la
 * navegación al hacer click en un día (ω-D). El componente subyacente
 * `CalendarHeatmap` queda agnóstico — recibe `onSelectDay` y lo invoca
 * cuando hace falta.
 *
 * El click navega a Momentos con `?day=ISO`. MomentosView lee el param
 * y filtra el timeline. Si ese día no tiene momentos pero sí entidades
 * o citas, el banner del filtro lo aclara — el heatmap mezcla las tres
 * métricas, los momentos son solo una.
 *
 * `relationships` se tipa local porque HomeView usa una forma estrecha
 * (createdAt + origin.kind) para evitar acoplarse al tipo completo de
 * Relationship en la prop drilling.
 */
export function ActivityHeatmap({
  entities,
  quotes,
  relationships,
  onNavigateToMomentos,
}: {
  entities: Entity[]
  quotes: Quote[]
  relationships: Relationship[]
  onNavigateToMomentos: () => void
}) {
  return (
    // π1: Heatmap de 12 semanas. Vista larga del pulso — complementa
    // el WeeklyActivity inmediato. Mismo mapeo de colores (λ7).
    // Self-hide si no hay datos en la ventana.
    <CalendarHeatmap
      entities={entities}
      quotes={quotes}
      relationships={relationships}
      onSelectDay={(iso) => {
        // ω-D: navegar a Momentos con ?day=ISO. MomentosView lee el
        // param y filtra el timeline.
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.set('view', 'momentos')
          url.searchParams.set('day', iso)
          window.history.pushState({}, '', url.toString())
          // Disparar popstate manualmente para que App reaccione.
          window.dispatchEvent(new PopStateEvent('popstate'))
        }
        onNavigateToMomentos()
      }}
    />
  )
}
