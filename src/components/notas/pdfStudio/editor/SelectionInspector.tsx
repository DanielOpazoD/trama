import type { Annotation } from '../../../../lib/pdfStudio/model/model'
import type {
  AnnotationDistributionAxis,
  AnnotationHorizontalAlignment,
  AnnotationLayerMove,
} from './pdfAnnotationArrange'
import { focusRing } from './EditorToolbarPrimitives'

type AnnotationBounds = {
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
}

const COLORS = [
  { hex: '#222222', label: 'Tinta' },
  { hex: '#ffffff', label: 'Papel' },
  { hex: '#b3412c', label: 'Rojo' },
  { hex: '#2f5d8a', label: 'Azul' },
  { hex: '#4b7355', label: 'Verde' },
  { hex: '#f2c94c', label: 'Amarillo' },
]

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

function pctNumber(value: number): number {
  return Math.round(value * 100)
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  disabled: boolean
}) {
  return (
    <label className="grid gap-0.5 text-micro text-ink-400">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        max="100"
        step="1"
        value={pctNumber(value)}
        disabled={disabled}
        aria-label={`${label} de selección (%)`}
        onChange={(e) => onChange(Number(e.currentTarget.value) / 100)}
        className="h-7 rounded-md border border-ink-100 bg-paper-50 px-1.5 text-caption tabular-nums text-ink-700 outline-none transition-colors focus:border-[color:var(--accent-sage)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent-sage)] focus-visible:ring-offset-1 disabled:opacity-45"
      />
    </label>
  )
}

function Glyph({
  kind,
}: {
  kind:
    | 'left'
    | 'center'
    | 'right'
    | 'front'
    | 'back'
    | 'lock'
    | 'distribute-x'
    | 'distribute-y'
    | 'group'
    | 'ungroup'
}) {
  if (kind === 'lock') {
    return (
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
        <rect x="5" y="8" width="10" height="8" rx="1.5" stroke="currentColor" />
        <path d="M7 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" />
      </svg>
    )
  }
  if (kind === 'front' || kind === 'back') {
    return (
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
        <rect
          x={kind === 'front' ? 7 : 4}
          y={kind === 'front' ? 4 : 7}
          width="8"
          height="8"
          rx="1"
          stroke="currentColor"
        />
        <rect
          x={kind === 'front' ? 4 : 7}
          y={kind === 'front' ? 7 : 4}
          width="8"
          height="8"
          rx="1"
          stroke="currentColor"
          opacity=".45"
        />
      </svg>
    )
  }
  if (kind === 'distribute-x' || kind === 'distribute-y') {
    const horizontal = kind === 'distribute-x'
    return (
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d={horizontal ? 'M3 10h14' : 'M10 3v14'}
          stroke="currentColor"
          opacity=".45"
        />
        <rect
          x={horizontal ? 3 : 7}
          y={horizontal ? 7 : 3}
          width="4"
          height="6"
          rx="1"
          stroke="currentColor"
        />
        <rect
          x={horizontal ? 13 : 7}
          y={horizontal ? 7 : 13}
          width="4"
          height="6"
          rx="1"
          stroke="currentColor"
        />
      </svg>
    )
  }
  if (kind === 'group' || kind === 'ungroup') {
    return (
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
        <rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" />
        <rect x="10" y="10" width="6" height="6" rx="1" stroke="currentColor" />
        {kind === 'group' ? (
          <path d="M9.5 7h3.5M13 7v3.5" stroke="currentColor" />
        ) : (
          <path d="M8 12h4" stroke="currentColor" />
        )}
      </svg>
    )
  }
  const x = kind === 'left' ? 5 : kind === 'center' ? 8 : 11
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d={kind === 'center' ? 'M10 3v14' : `M${kind === 'left' ? 4 : 16} 3v14`}
        stroke="currentColor"
        opacity=".5"
      />
      <rect x={x} y="6" width="5" height="8" rx="1" stroke="currentColor" />
    </svg>
  )
}

function TinyButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${focusRing} ${
        active
          ? 'bg-[color:var(--accent-sage-soft)] text-[color:var(--accent-sage)]'
          : 'text-ink-500 hover:bg-ink-100/60 hover:text-ink-800'
      }`}
    >
      {children}
    </button>
  )
}

export function SelectionInspector({
  annotation,
  bounds,
  selectionCount,
  onAlign,
  onDistribute,
  onGroup,
  onUngroup,
  onLayerMove,
  onToggleLocked,
  onBoundsChange,
  onColorChange,
  onOpacityChange,
}: {
  annotation: Annotation
  bounds: AnnotationBounds
  selectionCount?: number
  onAlign: (alignment: AnnotationHorizontalAlignment) => void
  onDistribute: (axis: AnnotationDistributionAxis) => void
  onGroup: () => void
  onUngroup: () => void
  onLayerMove: (move: AnnotationLayerMove) => void
  onToggleLocked: (locked: boolean) => void
  onBoundsChange: (patch: Partial<AnnotationBounds>) => void
  onColorChange: (color: string) => void
  onOpacityChange: (opacity: number) => void
}) {
  const locked = annotation.locked ?? false
  const color =
    'color' in annotation && typeof annotation.color === 'string'
      ? annotation.color
      : '#222222'
  const opacity = annotation.opacity ?? 1
  const count = Math.max(1, selectionCount ?? 1)
  const canDistribute = count >= 3
  const canGroup = count >= 2
  const canUngroup = count >= 2 || Boolean(annotation.groupId)
  const canEditBounds = count === 1 && !locked

  return (
    <aside
      aria-label="Inspector de selección"
      className="absolute right-3 top-28 z-30 w-[17rem] rounded-lg border border-ink-100/70 bg-paper-50/95 p-2 shadow-lg shadow-ink-900/10 backdrop-blur"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {count === 1 ? '1 objeto seleccionado' : `${count} objetos seleccionados`}
        {locked ? ', bloqueado' : ''}
      </p>
      <div className="flex items-center justify-between gap-2">
        <p className="text-caption font-medium text-ink-700">Selección</p>
        <TinyButton
          label={locked ? 'Desbloquear selección' : 'Bloquear selección'}
          active={locked}
          onClick={() => onToggleLocked(!locked)}
        >
          <Glyph kind="lock" />
        </TinyButton>
      </div>

      <dl className="mt-1 grid grid-cols-4 gap-1 text-micro tabular-nums text-ink-400">
        <div className="rounded bg-ink-50 px-1.5 py-1">x {pct(bounds.xRatio)}</div>
        <div className="rounded bg-ink-50 px-1.5 py-1">y {pct(bounds.yRatio)}</div>
        <div className="rounded bg-ink-50 px-1.5 py-1">w {pct(bounds.wRatio)}</div>
        <div className="rounded bg-ink-50 px-1.5 py-1">h {pct(bounds.hRatio)}</div>
      </dl>

      <div className="mt-2 grid grid-cols-4 gap-1">
        <Field
          label="X"
          value={bounds.xRatio}
          disabled={!canEditBounds}
          onChange={(xRatio) => onBoundsChange({ xRatio })}
        />
        <Field
          label="Y"
          value={bounds.yRatio}
          disabled={!canEditBounds}
          onChange={(yRatio) => onBoundsChange({ yRatio })}
        />
        <Field
          label="Ancho"
          value={bounds.wRatio}
          disabled={!canEditBounds}
          onChange={(wRatio) => onBoundsChange({ wRatio })}
        />
        <Field
          label="Alto"
          value={bounds.hRatio}
          disabled={!canEditBounds}
          onChange={(hRatio) => onBoundsChange({ hRatio })}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-md bg-ink-100/45 p-0.5">
          <TinyButton label="Alinear a la izquierda" onClick={() => onAlign('left')}>
            <Glyph kind="left" />
          </TinyButton>
          <TinyButton label="Alinear al centro" onClick={() => onAlign('center')}>
            <Glyph kind="center" />
          </TinyButton>
          <TinyButton label="Alinear a la derecha" onClick={() => onAlign('right')}>
            <Glyph kind="right" />
          </TinyButton>
        </div>
        <div className="inline-flex rounded-md bg-ink-100/45 p-0.5">
          <TinyButton label="Enviar atrás" onClick={() => onLayerMove('back')}>
            <Glyph kind="back" />
          </TinyButton>
          <TinyButton label="Traer al frente" onClick={() => onLayerMove('front')}>
            <Glyph kind="front" />
          </TinyButton>
        </div>
      </div>

      {(canDistribute || canGroup || canUngroup) && (
        <div className="mt-2 flex items-center justify-between gap-2">
          {canDistribute && (
            <div className="inline-flex rounded-md bg-ink-100/45 p-0.5">
              <TinyButton
                label="Distribuir horizontalmente"
                onClick={() => onDistribute('x')}
              >
                <Glyph kind="distribute-x" />
              </TinyButton>
              <TinyButton
                label="Distribuir verticalmente"
                onClick={() => onDistribute('y')}
              >
                <Glyph kind="distribute-y" />
              </TinyButton>
            </div>
          )}
          {(canGroup || canUngroup) && (
            <div className="ml-auto inline-flex rounded-md bg-ink-100/45 p-0.5">
              {canGroup && (
                <TinyButton label="Agrupar selección" onClick={onGroup}>
                  <Glyph kind="group" />
                </TinyButton>
              )}
              {canUngroup && (
                <TinyButton label="Desagrupar selección" onClick={onUngroup}>
                  <Glyph kind="ungroup" />
                </TinyButton>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              aria-label={`Color ${c.label}`}
              title={c.label}
              onClick={() => onColorChange(c.hex)}
              className={`h-5 w-5 rounded-full border transition-transform ${
                color === c.hex
                  ? 'scale-110 border-ink-700'
                  : 'border-ink-900/15 hover:scale-105'
              }`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
        <label className="flex w-24 items-center gap-1 text-micro text-ink-400">
          <span className="sr-only">Opacidad de selección</span>
          <input
            aria-label="Opacidad de selección"
            type="range"
            min="10"
            max="100"
            step="5"
            value={Math.round(opacity * 100)}
            onChange={(e) => onOpacityChange(Number(e.currentTarget.value) / 100)}
            className="w-full accent-[color:var(--accent-sage)]"
          />
        </label>
      </div>
    </aside>
  )
}
