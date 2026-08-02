import { clamp, stepBtn } from './editorStyle'
import { Hint, segGroup } from './EditorToolbarPrimitives'
import { ZoomPercentInput } from './ZoomPercentInput'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.1
const ZOOM_STEP = 0.1

export function EditorToolbarZoomControl({
  zoom,
  onBeforeChange,
  onZoomChange,
}: {
  zoom: number
  onBeforeChange?: () => void
  onZoomChange: (zoom: number) => void
}) {
  const zoomStep = (delta: number) => () => {
    onBeforeChange?.()
    onZoomChange(clamp(Math.round((zoom + delta) * 100) / 100, ZOOM_MIN, ZOOM_MAX))
  }

  return (
    /* Sin icono de lupa: era decorativo (`aria-hidden`) y "− 100 % +" ya dice
       zoom sin él. Costaba ~22px en TODAS las pantallas, y desde que el zoom va
       anclado fuera del carril que scrollea, su ancho se lo quita directamente a
       las herramientas — justo en móvil, donde menos sobra. */
    <div className={segGroup} aria-label="Zoom del documento">
      <Hint content="Zoom del documento: reducir">
        <button
          type="button"
          onPointerDown={onBeforeChange}
          onMouseDown={onBeforeChange}
          onFocus={onBeforeChange}
          onClick={zoomStep(-ZOOM_STEP)}
          disabled={zoom <= ZOOM_MIN}
          aria-label="Zoom del documento: reducir"
          className={stepBtn}
        >
          -
        </button>
      </Hint>
      <ZoomPercentInput
        zoom={zoom}
        onBeforeChange={onBeforeChange}
        onZoomChange={onZoomChange}
      />
      <Hint content="Zoom del documento: aumentar">
        <button
          type="button"
          onPointerDown={onBeforeChange}
          onMouseDown={onBeforeChange}
          onFocus={onBeforeChange}
          onClick={zoomStep(ZOOM_STEP)}
          disabled={zoom >= ZOOM_MAX}
          aria-label="Zoom del documento: aumentar"
          className={stepBtn}
        >
          +
        </button>
      </Hint>
    </div>
  )
}
