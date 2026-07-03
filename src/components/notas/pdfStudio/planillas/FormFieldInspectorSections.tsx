import type { ReactNode } from 'react'
import type { PdfFormFieldAlign } from '../../../../lib/pdfStudio/model/model'
import { COLORS, focusRing } from '../editor/EditorToolbarPrimitives'

/** Piezas presentacionales del inspector de casilleros: etiquetas de sección,
 *  botones compactos, filas de swatches y alineación. Sin estado propio. */

export function InspectorLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-0.5 pb-1 pt-2 text-micro uppercase tracking-eyebrow text-ink-300">
      {children}
    </p>
  )
}

export function InspectorToolButton({
  active,
  children,
  label,
  onClick,
}: {
  active?: boolean
  children: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...(active === undefined ? null : { 'aria-pressed': active })}
      onClick={onClick}
      className={`h-8 rounded-md border px-2 text-caption font-medium transition-colors ${focusRing} ${
        active
          ? 'border-[color:var(--accent-sage)]/50 bg-[color:var(--accent-sage-soft)]/60 text-[color:var(--accent-sage)]'
          : 'border-ink-100 bg-paper-50 text-ink-650 hover:border-[color:var(--accent-sage)]/40 hover:bg-[color:var(--accent-sage)]/8'
      }`}
    >
      {children}
    </button>
  )
}

/** Swatch "sin color": vuelve al default transparente del modo. */
function ClearSwatch({
  active,
  label,
  onSelect,
}: {
  active: boolean
  label: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onSelect}
      className={`grid h-6 w-6 place-items-center rounded-full border bg-paper-50 transition-transform hover:scale-110 ${focusRing} ${
        active ? 'border-ink-800' : 'border-ink-900/15'
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <line
          x1="2"
          y1="10"
          x2="10"
          y2="2"
          stroke="var(--accent-clay)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}

export function InspectorSwatchRow({
  activeColor,
  clearLabel,
  label,
  onClear,
  onSelect,
}: {
  activeColor?: string
  clearLabel: string
  label: string
  onClear: () => void
  onSelect: (hex: string) => void
}) {
  return (
    <div>
      <InspectorLabel>{label}</InspectorLabel>
      <div className="flex flex-wrap items-center gap-1 px-0.5">
        <ClearSwatch active={!activeColor} label={clearLabel} onSelect={onClear} />
        {COLORS.map((color) => (
          <button
            key={color.hex}
            type="button"
            aria-label={`${label} ${color.label}`}
            aria-pressed={activeColor === color.hex}
            title={color.label}
            onClick={() => onSelect(color.hex)}
            className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${focusRing} ${
              activeColor === color.hex ? 'border-ink-800' : 'border-ink-900/15'
            }`}
            style={{ backgroundColor: color.hex }}
          />
        ))}
      </div>
    </div>
  )
}

/** Orden de la selección múltiple: alinear en 6 ejes, igualar tamaños al
 *  casillero activo, duplicar el grupo; distribuir requiere ≥3. */
export function InspectorArrangeSection({
  count,
  onAlignFields,
  onDistributeFields,
  onDuplicateFields,
  onMatchFieldSizes,
}: {
  count: number
  onAlignFields: (
    alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
  ) => void
  onDistributeFields: (axis: 'x' | 'y') => void
  onDuplicateFields: () => void
  onMatchFieldSizes: (dimension: 'width' | 'height') => void
}) {
  return (
    <>
      <InspectorLabel>Ordenar selección</InspectorLabel>
      <div className="grid grid-cols-3 gap-1.5">
        <InspectorToolButton
          label="Alinear casilleros a la izquierda"
          onClick={() => onAlignFields('left')}
        >
          Izq
        </InspectorToolButton>
        <InspectorToolButton
          label="Alinear casilleros al centro"
          onClick={() => onAlignFields('center')}
        >
          Centro
        </InspectorToolButton>
        <InspectorToolButton
          label="Alinear casilleros a la derecha"
          onClick={() => onAlignFields('right')}
        >
          Der
        </InspectorToolButton>
        <InspectorToolButton
          label="Alinear casilleros arriba"
          onClick={() => onAlignFields('top')}
        >
          Arriba
        </InspectorToolButton>
        <InspectorToolButton
          label="Alinear casilleros al medio"
          onClick={() => onAlignFields('middle')}
        >
          Medio
        </InspectorToolButton>
        <InspectorToolButton
          label="Alinear casilleros abajo"
          onClick={() => onAlignFields('bottom')}
        >
          Abajo
        </InspectorToolButton>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <InspectorToolButton
          label="Igualar ancho de casilleros al activo"
          onClick={() => onMatchFieldSizes('width')}
        >
          = Ancho
        </InspectorToolButton>
        <InspectorToolButton
          label="Igualar alto de casilleros al activo"
          onClick={() => onMatchFieldSizes('height')}
        >
          = Alto
        </InspectorToolButton>
      </div>
      {count >= 3 && (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <InspectorToolButton
            label="Distribuir casilleros horizontalmente"
            onClick={() => onDistributeFields('x')}
          >
            Distribuir X
          </InspectorToolButton>
          <InspectorToolButton
            label="Distribuir casilleros verticalmente"
            onClick={() => onDistributeFields('y')}
          >
            Distribuir Y
          </InspectorToolButton>
        </div>
      )}
      <div className="mt-1.5 grid">
        <InspectorToolButton
          label="Duplicar casilleros seleccionados"
          onClick={onDuplicateFields}
        >
          Duplicar selección
        </InspectorToolButton>
      </div>
    </>
  )
}

function AlignGlyph({ align }: { align: PdfFormFieldAlign }) {
  const x = (width: number) =>
    align === 'left' ? 2 : align === 'center' ? (14 - width) / 2 : 12 - width
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      {[
        { y: 3.5, w: 10 },
        { y: 7, w: 6 },
        { y: 10.5, w: 8 },
      ].map(({ y, w }) => (
        <line
          key={y}
          x1={x(w)}
          y1={y}
          x2={x(w) + w}
          y2={y}
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

const ALIGN_OPTIONS: { key: PdfFormFieldAlign; label: string }[] = [
  { key: 'left', label: 'Alinear texto a la izquierda' },
  { key: 'center', label: 'Centrar texto' },
  { key: 'right', label: 'Alinear texto a la derecha' },
]

export function InspectorAlignRow({
  active,
  onAlign,
}: {
  active?: PdfFormFieldAlign
  onAlign: (align: PdfFormFieldAlign) => void
}) {
  const current = active ?? 'left'
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {ALIGN_OPTIONS.map((option) => (
        <InspectorToolButton
          key={option.key}
          label={option.label}
          active={current === option.key}
          onClick={() => onAlign(option.key)}
        >
          <span className="inline-flex w-full justify-center">
            <AlignGlyph align={option.key} />
          </span>
        </InspectorToolButton>
      ))}
    </div>
  )
}
