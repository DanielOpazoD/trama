import { useEffect, useRef, useState } from 'react'
import {
  screenDeltaToPage,
  type PageLayout,
} from '../../../../lib/pdfStudio/model/editorGeometry'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Fantasma del casillero pendiente: sigue el cursor sobre la página y muestra
 * dónde (y de qué tamaño) quedará el casillero al hacer clic. Se monta dentro
 * de la lámina de la página y escucha el puntero en su padre, así funciona en
 * cualquier página sin cablear estado de hover hacia arriba. La posición
 * replica la matemática de colocación (centrado en el cursor, acotado).
 */
export function FormFieldPlacementPreview({
  box,
  layout,
  zoom,
}: {
  box: { wRatio: number; hRatio: number }
  layout: PageLayout | null
  zoom: number
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const parent = hostRef.current?.parentElement
    if (!parent || !layout) return
    const onMove = (event: PointerEvent) => {
      // clientX/Y → offset local de la lámina, deshaciendo rotación y zoom.
      const rect = parent.getBoundingClientRect()
      const dx = event.clientX - (rect.left + rect.width / 2)
      const dy = event.clientY - (rect.top + rect.height / 2)
      const page = screenDeltaToPage(dx, dy, layout.rot)
      setCenter({
        x: 0.5 + page.dx / Math.max(1, layout.innerW * zoom),
        y: 0.5 + page.dy / Math.max(1, layout.innerH * zoom),
      })
    }
    const onLeave = () => setCenter(null)
    parent.addEventListener('pointermove', onMove)
    parent.addEventListener('pointerleave', onLeave)
    return () => {
      parent.removeEventListener('pointermove', onMove)
      parent.removeEventListener('pointerleave', onLeave)
    }
  }, [layout, zoom])

  const inverseZoom = 1 / Math.max(0.25, zoom)
  return (
    <div ref={hostRef} aria-hidden className="pointer-events-none absolute inset-0 z-30">
      {center ? (
        <div
          data-testid="form-field-placement-preview"
          className="absolute rounded-sm border border-dashed border-[color:var(--accent-sage)] bg-[color:var(--accent-sage-soft)]/35"
          style={{
            left: `${Math.min(1 - box.wRatio, clamp01(center.x - box.wRatio / 2)) * 100}%`,
            top: `${Math.min(1 - box.hRatio, clamp01(center.y - box.hRatio / 2)) * 100}%`,
            width: `${box.wRatio * 100}%`,
            height: `${box.hRatio * 100}%`,
            borderWidth: `${inverseZoom}px`,
          }}
        />
      ) : null}
    </div>
  )
}
