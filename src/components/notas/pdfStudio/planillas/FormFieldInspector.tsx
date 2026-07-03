import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type {
  PdfFormFieldDraft,
  PdfFormValue,
} from '../../../../lib/pdfStudio/model/model'
import type { AnnotationDistributionAxis } from '../editor/pdfAnnotationArrange'
import type { FormFieldAlignment, FormFieldSizeDimension } from './pdfFormFieldArrange'
import { clamp, type TextStyle } from '../editor/editorStyle'
import { focusRing } from '../editor/EditorToolbarPrimitives'
import { formFieldTextStyle, type FormFieldVisualPatch } from './pdfFormFieldStyle'
import type { FormFieldPresetKey } from './pdfFormFieldPresets'
import {
  InspectorAlignRow,
  InspectorArrangeSection,
  InspectorHeader,
  InspectorLabel,
  InspectorPresetRow,
  InspectorSwatchRow,
  InspectorToolButton,
} from './FormFieldInspectorSections'

const SIZE_STEP = 0.005
const SIZE_MIN = 0.015
const SIZE_MAX = 0.12

function valueAsText(value: PdfFormValue): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  return ''
}

const fieldInput = `h-8 rounded-md border border-ink-100 bg-paper-50 px-2 text-caption text-ink-800 outline-none ${focusRing}`

/**
 * Inspector de la selección de casilleros (uno o varios). Con selección
 * múltiple, los cambios de estilo/flags aplican a todos; variable y valor
 * inicial solo se editan de a uno.
 */
export function FormFieldInspector({
  fields,
  dragStyle,
  onAlignFields,
  onApplyPreset,
  onApplyStyle,
  onApplyVisual,
  onDelete,
  onDistributeFields,
  onDragHandlePointerDown,
  onDuplicateFields,
  onMatchFieldSizes,
  onPatchSelection,
  onRememberStyle,
  onRename,
  onValueChange,
}: {
  /** Selección actual (1..n); el último es el casillero activo. */
  fields: PdfFormFieldDraft[]
  /** Offset de arrastre (vive arriba para persistir entre selecciones). */
  dragStyle?: CSSProperties
  onAlignFields: (alignment: FormFieldAlignment) => void
  onApplyPreset: (key: FormFieldPresetKey) => void
  onApplyStyle: (patch: Partial<TextStyle>) => void
  onApplyVisual: (patch: FormFieldVisualPatch) => void
  onDelete: () => void
  onDistributeFields: (axis: AnnotationDistributionAxis) => void
  onDragHandlePointerDown?: (event: ReactPointerEvent<HTMLElement>) => void
  onDuplicateFields: () => void
  onMatchFieldSizes: (dimension: FormFieldSizeDimension) => void
  onPatchSelection: (patch: { required?: boolean; readOnly?: boolean }) => void
  onRememberStyle?: () => void
  onRename: (name: string) => void
  onValueChange: (value: string | boolean) => void
}) {
  const active = fields[fields.length - 1]
  if (!active) return null
  const multi = fields.length > 1
  const activeText = formFieldTextStyle(active)
  const canEditValue =
    !multi &&
    (active.fieldKind === 'text' ||
      active.fieldKind === 'date' ||
      active.fieldKind === 'signature')
  const hasTextControls = fields.some(
    (field) => field.fieldKind === 'text' || field.fieldKind === 'date',
  )
  const stepSize = (delta: number) =>
    onApplyStyle({ sizeRatio: clamp(activeText.sizeRatio + delta, SIZE_MIN, SIZE_MAX) })

  return (
    <aside
      data-draggable-panel
      aria-label={
        multi ? 'Inspector de casilleros seleccionados' : 'Inspector de casillero'
      }
      style={dragStyle}
      className="absolute right-3 top-28 z-30 max-h-[calc(100vh-9rem)] w-[17rem] overflow-y-auto rounded-xl border border-ink-100 bg-paper-50/95 p-2.5 shadow-xl shadow-ink-900/15 backdrop-blur-md"
    >
      <InspectorHeader
        count={fields.length}
        kind={active.fieldKind}
        onDelete={onDelete}
        onDragHandlePointerDown={onDragHandlePointerDown}
      />

      {!multi && (
        <label className="mt-2 grid gap-1 text-micro text-ink-500">
          <span>Variable</span>
          <input
            type="text"
            aria-label="Nombre del casillero"
            value={active.name}
            onChange={(event) => onRename(event.currentTarget.value)}
            className={fieldInput}
          />
        </label>
      )}

      {canEditValue && (
        <label className="mt-2 grid gap-1 text-micro text-ink-500">
          <span>Valor inicial</span>
          <input
            type={active.fieldKind === 'date' ? 'date' : 'text'}
            aria-label="Valor inicial del casillero"
            value={valueAsText(active.value)}
            onChange={(event) => onValueChange(event.currentTarget.value)}
            className={fieldInput}
          />
        </label>
      )}

      {hasTextControls && <InspectorPresetRow onApplyPreset={onApplyPreset} />}

      {hasTextControls && (
        <>
          <InspectorLabel>Texto</InspectorLabel>
          <div className="grid grid-cols-4 gap-1.5">
            <InspectorToolButton
              label="Reducir tamaño de letra"
              onClick={() => stepSize(-SIZE_STEP)}
            >
              A−
            </InspectorToolButton>
            <span
              aria-label="Tamaño de letra actual"
              className="inline-flex h-8 items-center justify-center text-caption tabular-nums text-ink-600"
            >
              {Math.round(activeText.sizeRatio * 792)}
            </span>
            <InspectorToolButton
              label="Aumentar tamaño de letra"
              onClick={() => stepSize(SIZE_STEP)}
            >
              A+
            </InspectorToolButton>
            <InspectorToolButton
              label="Negrita"
              active={activeText.bold}
              onClick={() => onApplyStyle({ bold: !activeText.bold })}
            >
              B
            </InspectorToolButton>
          </div>
          <div className="mt-1.5">
            <InspectorAlignRow
              active={active.align}
              onAlign={(align) => onApplyVisual({ align })}
            />
          </div>
          <InspectorSwatchRow
            label="Color de texto"
            activeColor={active.color}
            clearLabel="Color de texto por defecto"
            onClear={() => onApplyVisual({ color: null })}
            onSelect={(hex) => onApplyVisual({ color: hex })}
          />
        </>
      )}

      <InspectorSwatchRow
        label="Fondo"
        activeColor={active.bgColor}
        clearLabel="Sin fondo"
        onClear={() => onApplyVisual({ bgColor: null })}
        onSelect={(hex) => onApplyVisual({ bgColor: hex })}
      />
      <InspectorSwatchRow
        label="Borde"
        activeColor={active.borderColor}
        clearLabel="Sin borde"
        onClear={() => onApplyVisual({ borderColor: null })}
        onSelect={(hex) => onApplyVisual({ borderColor: hex })}
      />

      <div className="mt-2 grid gap-1.5 text-caption text-ink-600">
        <label htmlFor="form-field-required" className="flex items-center gap-2">
          <input
            id="form-field-required"
            type="checkbox"
            checked={active.required ?? false}
            onChange={(event) =>
              onPatchSelection({ required: event.currentTarget.checked })
            }
            className="accent-[color:var(--accent-sage)]"
          />
          Requerido
        </label>
        <label htmlFor="form-field-read-only" className="flex items-center gap-2">
          <input
            id="form-field-read-only"
            type="checkbox"
            checked={active.readOnly ?? false}
            onChange={(event) =>
              onPatchSelection({ readOnly: event.currentTarget.checked })
            }
            className="accent-[color:var(--accent-sage)]"
          />
          Solo lectura
        </label>
      </div>

      {multi && (
        <InspectorArrangeSection
          count={fields.length}
          onAlignFields={onAlignFields}
          onDistributeFields={onDistributeFields}
          onDuplicateFields={onDuplicateFields}
          onMatchFieldSizes={onMatchFieldSizes}
        />
      )}

      {!multi && active.fieldKind === 'text' && onRememberStyle && (
        <button
          type="button"
          onClick={onRememberStyle}
          className={`mt-2 w-full rounded-md border border-dashed border-[color:var(--accent-sage)]/50 px-2 py-1.5 text-caption font-medium text-[color:var(--accent-sage)] transition-colors hover:bg-[color:var(--accent-sage-soft)]/50 ${focusRing}`}
        >
          Usar como estilo de nuevos casilleros
        </button>
      )}
    </aside>
  )
}
