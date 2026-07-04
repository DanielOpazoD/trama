import { type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
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
  InspectorToolButton,
} from './FormFieldInspectorSections'
import { FormFieldInspectorMoreOptions } from './FormFieldInspectorMoreOptions'
import {
  PAGE_PT,
  PT_MAX,
  PT_MIN,
  inspectorValueAsText as valueAsText,
  type InspectorFlagsPatch,
} from './formFieldInspectorModel'

const fieldInput = `h-8 rounded-md border border-ink-100 bg-paper-50 px-2 text-caption text-ink-800 outline-none ${focusRing}`

/**
 * Inspector de la selección de casilleros (uno o varios). Lo esencial queda a
 * la vista (variable, valor, tamaño, alineación); colores, presets y opciones
 * avanzadas —uso poco frecuente— viven detrás de un «Más opciones» sutil.
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
  onNavigate,
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
  onNavigate?: (direction: 1 | -1) => void
  onPatchSelection: (patch: InspectorFlagsPatch) => void
  onRememberStyle?: () => void
  onRename: (name: string) => void
  onValueChange: (value: string | boolean) => void
}) {
  const active = fields[fields.length - 1]
  if (!active) return null
  const multi = fields.length > 1
  const activeText = formFieldTextStyle(active)
  const activePt = Math.round(activeText.sizeRatio * PAGE_PT)
  const canEditValue =
    !multi &&
    (active.fieldKind === 'text' ||
      active.fieldKind === 'date' ||
      active.fieldKind === 'signature')
  const hasTextControls = fields.some(
    (field) => field.fieldKind === 'text' || field.fieldKind === 'date',
  )
  const setPt = (pt: number) =>
    onApplyStyle({ sizeRatio: clamp(Math.round(pt), PT_MIN, PT_MAX) / PAGE_PT })

  return (
    <aside
      data-draggable-panel
      aria-label={
        multi ? 'Inspector de casilleros seleccionados' : 'Inspector de casillero'
      }
      style={dragStyle}
      className="animate-pdf-panel-in fixed right-6 top-28 z-[70] max-h-[calc(100vh-9rem)] w-[17rem] overflow-y-auto rounded-xl border border-ink-100 bg-paper-50/95 p-2.5 shadow-xl shadow-ink-900/15 backdrop-blur-md"
    >
      <InspectorHeader
        count={fields.length}
        kind={active.fieldKind}
        onDelete={onDelete}
        onDragHandlePointerDown={onDragHandlePointerDown}
        onNavigate={onNavigate}
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

      {hasTextControls && (
        <>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <InspectorToolButton
              label="Reducir tamaño de letra"
              onClick={() => setPt(activePt - 1)}
            >
              A−
            </InspectorToolButton>
            <input
              type="number"
              aria-label="Tamaño de letra en puntos"
              value={activePt}
              min={PT_MIN}
              max={PT_MAX}
              onChange={(event) => {
                const pt = Number(event.currentTarget.value)
                if (Number.isFinite(pt) && pt > 0) setPt(pt)
              }}
              className={`h-8 rounded-md border border-ink-100 bg-paper-50 px-1 text-center text-caption tabular-nums text-ink-700 outline-none ${focusRing}`}
            />
            <InspectorToolButton
              label="Aumentar tamaño de letra"
              onClick={() => setPt(activePt + 1)}
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
        </>
      )}

      {multi && (
        <InspectorArrangeSection
          count={fields.length}
          onAlignFields={onAlignFields}
          onDistributeFields={onDistributeFields}
          onDuplicateFields={onDuplicateFields}
          onMatchFieldSizes={onMatchFieldSizes}
        />
      )}

      <FormFieldInspectorMoreOptions
        active={active}
        hasTextControls={hasTextControls}
        multi={multi}
        onApplyPreset={onApplyPreset}
        onApplyVisual={onApplyVisual}
        onPatchSelection={onPatchSelection}
        onRememberStyle={onRememberStyle}
      />
    </aside>
  )
}
