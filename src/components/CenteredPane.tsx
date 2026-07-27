import type { ReactNode } from 'react'

/**
 * Contenido centrado en un alto fijo que **no se pierde cuando no cabe**.
 *
 * El patrón evidente —`h-full flex items-center justify-center`— tiene una
 * trampa: en cuanto el contenido supera el alto disponible, `items-center`
 * reparte el exceso a partes iguales arriba y abajo. Lo de abajo se sale de
 * la pantalla y lo de arriba queda en coordenadas negativas, donde ningún
 * scroll llega porque `scrollTop` no puede ser menor que cero. El contenido no
 * está oculto: está fuera de alcance.
 *
 * Medido en el estado vacío del Grafo a 669×359 (un móvil en horizontal): la
 * cita salía recortada por arriba y el botón "cargar ejemplo" —la única acción
 * de la pantalla— caía en `bottom: 391` con el viewport en 359. Forzar
 * `scrollTop` no movía nada.
 *
 * La solución es separar las dos responsabilidades: el contenedor exterior
 * scrollea, y el interior usa `min-h-full` para centrar **sólo cuando sobra
 * sitio**. Si el contenido crece, el interior crece con él y el exterior le da
 * scroll real.
 *
 * `className` es para el padding del caso concreto (`px-8`, `p-6`); el resto
 * del layout lo pone el componente.
 */
export function CenteredPane({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className={`flex min-h-full items-center justify-center ${className}`}>
        {children}
      </div>
    </div>
  )
}
