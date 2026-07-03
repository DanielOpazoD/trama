import {
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'

const VIEWPORT_MARGIN = 8

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * Paneles flotantes movibles (el inspector de casilleros): arrastre desde un
 * handle, acotado a la ventana. El offset vive en quien monte el hook — si se
 * monta en un componente que persiste (p. ej. FloatingFormTools), la posición
 * elegida se conserva aunque la selección cambie. El panel debe declarar
 * `data-draggable-panel` para medirse al iniciar el arrastre.
 */
export function useDraggablePanel() {
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  function startPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    // Los controles dentro del handle siguen siendo clickeables.
    if ((event.target as HTMLElement).closest('button, input, select, textarea')) return
    event.preventDefault()
    const panel = (event.currentTarget as HTMLElement).closest<HTMLElement>(
      '[data-draggable-panel]',
    )
    const rect = panel?.getBoundingClientRect() ?? null
    const startX = event.clientX
    const startY = event.clientY
    const base = offset
    const baseLeft = (rect?.left ?? 0) - base.x
    const baseTop = (rect?.top ?? 0) - base.y
    const move = (ev: PointerEvent) => {
      const rawX = base.x + ev.clientX - startX
      const rawY = base.y + ev.clientY - startY
      if (!rect) {
        setOffset({ x: rawX, y: rawY })
        return
      }
      setOffset({
        x: clamp(
          rawX,
          VIEWPORT_MARGIN - baseLeft,
          window.innerWidth - rect.width - VIEWPORT_MARGIN - baseLeft,
        ),
        y: clamp(
          rawY,
          VIEWPORT_MARGIN - baseTop,
          window.innerHeight - rect.height - VIEWPORT_MARGIN - baseTop,
        ),
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const panelStyle: CSSProperties =
    offset.x === 0 && offset.y === 0
      ? {}
      : { transform: `translate(${offset.x}px, ${offset.y}px)` }

  return { panelStyle, startPanelDrag }
}
