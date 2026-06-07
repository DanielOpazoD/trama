import type {
  AnnotationDistributionAxis,
  AnnotationHorizontalAlignment,
} from './pdfAnnotationArrange'
import { focusRing } from './EditorToolbarPrimitives'

function ToolButton({
  children,
  label,
  onClick,
}: {
  children: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`h-8 rounded-md border border-ink-100 bg-paper-50 px-2 text-caption font-medium text-ink-650 hover:border-[color:var(--accent-sage)]/40 hover:bg-[color:var(--accent-sage)]/8 ${focusRing}`}
    >
      {children}
    </button>
  )
}

export function FormFieldSelectionInspector({
  count,
  onAlign,
  onDistribute,
}: {
  count: number
  onAlign: (alignment: AnnotationHorizontalAlignment) => void
  onDistribute: (axis: AnnotationDistributionAxis) => void
}) {
  return (
    <aside
      aria-label="Inspector de casilleros seleccionados"
      className="absolute right-3 top-28 z-30 w-[17rem] rounded-lg border border-[color:var(--accent-sage)]/30 bg-paper-50/95 p-2 shadow-lg shadow-ink-900/10 backdrop-blur"
    >
      <div>
        <p className="text-caption font-medium text-ink-700">{count} casilleros</p>
        <p className="text-micro text-ink-400">Ordenar selección</p>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <ToolButton
          label="Alinear casilleros a la izquierda"
          onClick={() => onAlign('left')}
        >
          Izq
        </ToolButton>
        <ToolButton
          label="Alinear casilleros al centro"
          onClick={() => onAlign('center')}
        >
          Centro
        </ToolButton>
        <ToolButton
          label="Alinear casilleros a la derecha"
          onClick={() => onAlign('right')}
        >
          Der
        </ToolButton>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <ToolButton
          label="Distribuir casilleros horizontalmente"
          onClick={() => onDistribute('x')}
        >
          Distribuir X
        </ToolButton>
        <ToolButton
          label="Distribuir casilleros verticalmente"
          onClick={() => onDistribute('y')}
        >
          Distribuir Y
        </ToolButton>
      </div>
    </aside>
  )
}
