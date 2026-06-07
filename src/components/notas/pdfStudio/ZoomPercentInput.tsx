import { useEffect, useState } from 'react'
import { focusRing } from './EditorToolbarPrimitives'

const ZOOM_MIN_PERCENT = 50
const ZOOM_MAX_PERCENT = 210

function clampPercent(value: number): number {
  return Math.min(ZOOM_MAX_PERCENT, Math.max(ZOOM_MIN_PERCENT, value))
}

export function zoomPercentToScale(value: string): number | null {
  const normalized = value.replace('%', '').trim().replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return null
  return clampPercent(Math.round(parsed)) / 100
}

export function ZoomPercentInput({
  zoom,
  onBeforeChange,
  onZoomChange,
  className = 'w-11',
}: {
  zoom: number
  onBeforeChange?: () => void
  onZoomChange: (zoom: number) => void
  className?: string
}) {
  const value = String(Math.round(zoom * 100))
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = () => {
    const next = zoomPercentToScale(draft)
    if (next === null) {
      setDraft(value)
      return
    }
    onBeforeChange?.()
    onZoomChange(next)
    setDraft(String(Math.round(next * 100)))
  }

  return (
    <label
      className={`${className} inline-flex items-center justify-center rounded-sm px-0.5 text-caption tabular-nums text-ink-600 ${focusRing}`}
      aria-label="Zoom del documento (%)"
    >
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onFocus={onBeforeChange}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setDraft(value)
            e.currentTarget.blur()
          }
        }}
        className="w-full bg-transparent text-right text-caption tabular-nums text-ink-600 outline-none"
        aria-label="Porcentaje de zoom"
      />
      <span aria-hidden className="pl-0.5 text-ink-500">
        %
      </span>
    </label>
  )
}
