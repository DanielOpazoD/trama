import {
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
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
  InspectorAdvancedSection,
  InspectorAlignRow,
  InspectorArrangeSection,
  InspectorColorPreview,
  InspectorDisclosure,
  InspectorHeader,
  InspectorPresetRow,
  InspectorSwatchRow,
  InspectorToolButton,
} from './FormFieldInspectorSections'

/** Tamaño de letra en puntos (alto carta = 792 pt): pasos de 1 pt y entrada exacta. */
const PAGE_PT = 792
const PT_MIN = 6
const PT_MAX = 96

type InspectorSection = 'color' | 'bg' | 'border' | 'presets' | 'advanced'

function valueAsText(value: PdfFormValue): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  return ''
}

const fieldInput = `h-8 rounded-md border border-ink-100 bg-paper-50 px-2 text-caption text-ink-800 outline-none ${focusRing}`

/**
 * Inspector de la selección de casilleros (uno o varios). Lo esencial queda a
 * la vista (variable, valor, tamaño, alineación); colores, presets y opciones
 * avanzadas viven en filas plegables para que el panel respire.
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
  onPatchSelection: (patch: { required?: boolean; readOnly?: boolean }) => void
  onRememberStyle?: () => void
  onRename: (name: string) => void
  onValueChange: (value: string | boolean) => void
}) {
  const [openSection, setOpenSection] = useState<InspectorSection | null>(null)
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
  const toggle = (section: InspectorSection) =>
    setOpenSection((current) => (current === section ? null : section))

  return (
    <aside
      data-draggable-panel
      aria-label={
        multi ? 'Inspector de casilleros seleccionados' : 'Inspector de casillero'
      }
      style={dragStyle}
      className="fixed right-6 top-28 z-[70] max-h-[calc(100vh-9rem)] w-[17rem] overflow-y-auto rounded-xl border border-ink-100 bg-paper-50/95 p-2.5 shadow-xl shadow-ink-900/15 backdrop-blur-md"
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
          <InspectorDisclosure
            label="Color de texto"
            open={openSection === 'color'}
            preview={<InspectorColorPreview color={active.color} />}
            onToggle={() => toggle('color')}
          >
            <InspectorSwatchRow
              label="Color de texto"
              activeColor={active.color}
              clearLabel="Color de texto por defecto"
              onClear={() => onApplyVisual({ color: null })}
              onSelect={(hex) => onApplyVisual({ color: hex })}
            />
          </InspectorDisclosure>
        </>
      )}

      <InspectorDisclosure
        label="Fondo"
        open={openSection === 'bg'}
        preview={<InspectorColorPreview color={active.bgColor} />}
        onToggle={() => toggle('bg')}
      >
        <InspectorSwatchRow
          label="Fondo"
          activeColor={active.bgColor}
          clearLabel="Sin fondo"
          onClear={() => onApplyVisual({ bgColor: null })}
          onSelect={(hex) => onApplyVisual({ bgColor: hex })}
        />
      </InspectorDisclosure>
      <InspectorDisclosure
        label="Borde"
        open={openSection === 'border'}
        preview={<InspectorColorPreview color={active.borderColor} />}
        onToggle={() => toggle('border')}
      >
        <InspectorSwatchRow
          label="Borde"
          activeColor={active.borderColor}
          clearLabel="Sin borde"
          onClear={() => onApplyVisual({ borderColor: null })}
          onSelect={(hex) => onApplyVisual({ borderColor: hex })}
        />
      </InspectorDisclosure>

      {hasTextControls && (
        <InspectorDisclosure
          label="Presets"
          hint="Estilos completos de un clic"
          open={openSection === 'presets'}
          onToggle={() => toggle('presets')}
        >
          <InspectorPresetRow onApplyPreset={onApplyPreset} />
        </InspectorDisclosure>
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

      <InspectorDisclosure
        label="Avanzado"
        open={openSection === 'advanced'}
        onToggle={() => toggle('advanced')}
      >
        <InspectorAdvancedSection
          required={active.required ?? false}
          readOnly={active.readOnly ?? false}
          showRememberStyle={!multi && active.fieldKind === 'text'}
          onPatchSelection={onPatchSelection}
          onRememberStyle={onRememberStyle}
        />
      </InspectorDisclosure>
    </aside>
  )
}
