import { ChevronDownIcon, SettingsIcon } from '../../../Icons'
import { OverflowMenu } from '../../../OverflowMenu'
import { editorMenuLayer, menuTrigger } from './EditorToolbarPrimitives'
import {
  stepBtn,
  X_SIZE_MAX,
  X_SIZE_MIN,
  X_SIZE_STEP,
  X_STROKE_MAX,
  X_STROKE_MIN,
  X_STROKE_STEP,
} from './editorStyle'

/** % de un valor respecto de su máximo, para mostrarlo de forma intuitiva. */
function pct(value: number, max: number): string {
  return `${Math.round((value / max) * 100)}%`
}

function XConfigRow({
  label,
  value,
  onDec,
  onInc,
  decDisabled,
  incDisabled,
  decLabel,
  incLabel,
}: {
  label: string
  value: string
  onDec: () => void
  onInc: () => void
  decDisabled: boolean
  incDisabled: boolean
  decLabel: string
  incLabel: string
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 py-0.5">
      <span className="text-caption text-ink-700">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onDec}
          disabled={decDisabled}
          className={stepBtn}
          aria-label={decLabel}
        >
          -
        </button>
        <span
          className="min-w-[2.75rem] text-center text-micro tabular-nums text-ink-500"
          aria-live="polite"
        >
          {value}
        </span>
        <button
          type="button"
          onClick={onInc}
          disabled={incDisabled}
          className={stepBtn}
          aria-label={incLabel}
        >
          +
        </button>
      </div>
    </div>
  )
}

/** Botón "engranaje" que despliega el menú de configuración de la marca X
 *  (tamaño y grosor GLOBALES: aplican a todas las X del documento). */
export function EditorToolbarXMenu({
  xMarkSize,
  onXMarkSizeChange,
  xMarkStroke,
  onXMarkStrokeChange,
}: {
  xMarkSize: number
  onXMarkSizeChange: (next: number) => void
  xMarkStroke: number
  onXMarkStrokeChange: (next: number) => void
}) {
  return (
    <OverflowMenu
      label="Configurar la marca X (tamaño y grosor)"
      width="w-60"
      menuLayerClassName={editorMenuLayer}
      triggerClassName={menuTrigger}
      triggerContent={
        <>
          <SettingsIcon size={14} />
          <ChevronDownIcon size={12} className="text-ink-300" />
        </>
      }
    >
      {() => (
        <div className="space-y-1 p-1.5">
          <p className="px-1 pb-1 text-micro uppercase tracking-eyebrow text-ink-300">
            Marca X · aplica a todas
          </p>
          <XConfigRow
            label="Tamaño"
            value={pct(xMarkSize, X_SIZE_MAX)}
            onDec={() => onXMarkSizeChange(xMarkSize - X_SIZE_STEP)}
            onInc={() => onXMarkSizeChange(xMarkSize + X_SIZE_STEP)}
            decDisabled={xMarkSize <= X_SIZE_MIN + 1e-6}
            incDisabled={xMarkSize >= X_SIZE_MAX - 1e-6}
            decLabel="Achicar la marca X"
            incLabel="Agrandar la marca X"
          />
          <XConfigRow
            label="Grosor"
            value={pct(xMarkStroke, X_STROKE_MAX)}
            onDec={() => onXMarkStrokeChange(xMarkStroke - X_STROKE_STEP)}
            onInc={() => onXMarkStrokeChange(xMarkStroke + X_STROKE_STEP)}
            decDisabled={xMarkStroke <= X_STROKE_MIN + 1e-6}
            incDisabled={xMarkStroke >= X_STROKE_MAX - 1e-6}
            decLabel="Afinar la marca X"
            incLabel="Engrosar la marca X"
          />
        </div>
      )}
    </OverflowMenu>
  )
}
