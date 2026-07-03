import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { PdfFormFieldAlign } from '../../../../lib/pdfStudio/model/model'
import type { AnnotationDistributionAxis } from '../editor/pdfAnnotationArrange'
import type { FormFieldAlignment, FormFieldSizeDimension } from './pdfFormFieldArrange'
import { FORM_FIELD_PRESETS, type FormFieldPresetKey } from './pdfFormFieldPresets'
import { COLORS, focusRing } from '../editor/EditorToolbarPrimitives'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '../../../Icons'

/** Fila plegable del inspector: cabecera con vista previa a la derecha; el
 *  contenido solo existe mientras está abierta (el panel se mantiene bajo). */
export function InspectorDisclosure({
  label,
  hint,
  open,
  preview,
  onToggle,
  children,
}: {
  label: string
  hint?: string
  open: boolean
  preview?: ReactNode
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="mt-1.5 overflow-hidden rounded-lg border border-ink-100 bg-paper-50">
      <button
        type="button"
        aria-expanded={open}
        title={hint}
        onClick={onToggle}
        className={`flex h-8 w-full items-center justify-between gap-2 px-2 text-caption font-medium text-ink-650 transition-colors hover:bg-ink-50 ${focusRing}`}
      >
        <span>{label}</span>
        <span className="flex items-center gap-1.5 text-ink-300">
          {preview}
          <ChevronDownIcon
            size={12}
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {open ? <div className="border-t border-ink-100/70 p-2">{children}</div> : null}
    </div>
  )
}

/** Chip de vista previa de color para la cabecera de una fila plegable. */
export function InspectorColorPreview({ color }: { color?: string }) {
  if (!color) {
    return (
      <span
        aria-hidden
        className="grid h-4 w-4 place-items-center rounded-full border border-ink-900/15 bg-paper-50"
      >
        <svg width="8" height="8" viewBox="0 0 8 8">
          <line
            x1="1.5"
            y1="6.5"
            x2="6.5"
            y2="1.5"
            stroke="var(--accent-clay)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className="h-4 w-4 rounded-full border border-ink-900/15"
      style={{ backgroundColor: color }}
    />
  )
}

/** Piezas presentacionales del inspector de casilleros: etiquetas de sección,
 *  botones compactos, filas de swatches y alineación. Sin estado propio. */

/** Cabecera del inspector: título + navegación entre casilleros + eliminar,
 *  y handle de arrastre (grip). */
export function InspectorHeader({
  count,
  kind,
  onDelete,
  onDragHandlePointerDown,
  onNavigate,
}: {
  count: number
  kind: string
  onDelete: () => void
  onDragHandlePointerDown?: (event: ReactPointerEvent<HTMLElement>) => void
  /** Selecciona el casillero anterior/siguiente en orden visual. */
  onNavigate?: (direction: 1 | -1) => void
}) {
  const multi = count > 1
  return (
    <div
      onPointerDown={onDragHandlePointerDown}
      title="Arrastra para mover el inspector"
      className={`-mx-1 -mt-1 flex select-none items-center justify-between gap-2 rounded-lg px-1 pt-1 ${
        onDragHandlePointerDown ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{ touchAction: 'none' }}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-caption font-medium text-ink-700">
          {onDragHandlePointerDown ? (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              aria-hidden
              className="shrink-0 text-ink-300"
            >
              {[1.5, 5, 8.5].flatMap((y) =>
                [2.5, 7.5].map((x) => (
                  <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill="currentColor" />
                )),
              )}
            </svg>
          ) : null}
          {multi ? `${count} casilleros` : 'Casillero'}
        </p>
        <p className="text-micro text-ink-400">
          {multi ? 'El estilo aplica a toda la selección' : kind}
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-0.5">
        {onNavigate && !multi ? (
          <>
            <button
              type="button"
              aria-label="Casillero anterior"
              title="Casillero anterior"
              onClick={() => onNavigate(-1)}
              className={`grid h-6 w-6 place-items-center rounded text-ink-400 transition-colors hover:bg-ink-100/60 hover:text-ink-700 ${focusRing}`}
            >
              <ChevronLeftIcon size={12} />
            </button>
            <button
              type="button"
              aria-label="Casillero siguiente"
              title="Casillero siguiente"
              onClick={() => onNavigate(1)}
              className={`grid h-6 w-6 place-items-center rounded text-ink-400 transition-colors hover:bg-ink-100/60 hover:text-ink-700 ${focusRing}`}
            >
              <ChevronRightIcon size={12} />
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          className={`rounded-md px-2 py-1 text-caption font-medium text-[color:var(--accent-clay)] hover:bg-ink-100/60 ${focusRing}`}
        >
          Eliminar
          <span className="sr-only">{multi ? ` ${count} casilleros` : ' casillero'}</span>
        </button>
      </span>
    </div>
  )
}

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

/** Paleta de swatches (vive dentro de una fila plegable, que aporta el título;
 *  `label` acá solo prefija los nombres accesibles para desambiguar filas). */
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
  )
}

/** Presets de estilo: un clic deja el casillero (o toda la selección) con un
 *  look completo. Vive dentro de una fila plegable; el tooltip explica cada uno. */
export function InspectorPresetRow({
  onApplyPreset,
}: {
  onApplyPreset: (key: FormFieldPresetKey) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {FORM_FIELD_PRESETS.map((preset) => (
        <button
          key={preset.key}
          type="button"
          aria-label={`Preset ${preset.label}: ${preset.hint}`}
          title={preset.hint}
          onClick={() => onApplyPreset(preset.key)}
          className={`h-8 rounded-md border border-ink-100 bg-paper-50 px-2 text-caption font-medium text-ink-650 transition-colors hover:border-[color:var(--accent-sage)]/40 hover:bg-[color:var(--accent-sage)]/8 ${focusRing}`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  )
}

/** Sección Avanzado: flags con su explicación y el estilo default de nuevos
 *  casilleros. Lo que confunde a primera vista vive plegado y explicado. */
export function InspectorAdvancedSection({
  readOnly,
  required,
  showRememberStyle,
  onPatchSelection,
  onRememberStyle,
}: {
  readOnly: boolean
  required: boolean
  showRememberStyle: boolean
  onPatchSelection: (patch: { required?: boolean; readOnly?: boolean }) => void
  onRememberStyle?: () => void
}) {
  return (
    <div className="grid gap-2 text-caption text-ink-600">
      <label htmlFor="form-field-required" className="flex items-start gap-2">
        <input
          id="form-field-required"
          type="checkbox"
          checked={required}
          onChange={(event) =>
            onPatchSelection({ required: event.currentTarget.checked })
          }
          className="mt-0.5 accent-[color:var(--accent-sage)]"
        />
        <span>
          Requerido
          <span className="block text-micro text-ink-400">
            Al rellenar, imprimir avisa si este casillero queda vacío.
          </span>
        </span>
      </label>
      <label htmlFor="form-field-read-only" className="flex items-start gap-2">
        <input
          id="form-field-read-only"
          type="checkbox"
          checked={readOnly}
          onChange={(event) =>
            onPatchSelection({ readOnly: event.currentTarget.checked })
          }
          className="mt-0.5 accent-[color:var(--accent-sage)]"
        />
        <span>
          Solo lectura
          <span className="block text-micro text-ink-400">
            El casillero no se puede editar al rellenar (útil para valores fijos).
          </span>
        </span>
      </label>
      {showRememberStyle && onRememberStyle ? (
        <div className="border-t border-ink-100/70 pt-2">
          <button
            type="button"
            onClick={onRememberStyle}
            className={`w-full rounded-md border border-dashed border-[color:var(--accent-sage)]/50 px-2 py-1.5 text-caption font-medium text-[color:var(--accent-sage)] transition-colors hover:bg-[color:var(--accent-sage-soft)]/50 ${focusRing}`}
          >
            Usar como estilo de nuevos casilleros
          </button>
          <p className="mt-1 text-micro text-ink-400">
            Los próximos casilleros nacerán con este mismo tamaño de cuadro, letra y
            estilo.
          </p>
        </div>
      ) : null}
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
  onAlignFields: (alignment: FormFieldAlignment) => void
  onDistributeFields: (axis: AnnotationDistributionAxis) => void
  onDuplicateFields: () => void
  onMatchFieldSizes: (dimension: FormFieldSizeDimension) => void
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
