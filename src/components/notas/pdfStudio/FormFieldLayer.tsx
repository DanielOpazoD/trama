import { type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type {
  PdfFormFieldDraft,
  PdfFormFieldKind,
  PdfFormValue,
} from '../../../lib/pdfStudio/model'
import type { ResizeHandle } from '../../../lib/pdfStudio/editorGeometry'
import type { PdfFormFieldType } from '../../../lib/pdfStudio/pdfForms'
import { ACCENT, stepBtn } from './editorStyle'

export type VisualPdfFormWidget = {
  id: string
  sourceId: string
  fieldName: string
  type: PdfFormFieldType
  value: PdfFormValue
  options?: string[]
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
  readOnly?: boolean
}

const handles: { key: ResizeHandle; label: string; style: CSSProperties }[] = [
  { key: 'nw', label: 'esquina superior izquierda', style: { left: -5, top: -5 } },
  { key: 'ne', label: 'esquina superior derecha', style: { right: -5, top: -5 } },
  { key: 'sw', label: 'esquina inferior izquierda', style: { left: -5, bottom: -5 } },
  { key: 'se', label: 'esquina inferior derecha', style: { right: -5, bottom: -5 } },
]

function boxStyle(box: {
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
}): CSSProperties {
  return {
    position: 'absolute',
    left: `${box.xRatio * 100}%`,
    top: `${box.yRatio * 100}%`,
    width: `${box.wRatio * 100}%`,
    height: `${box.hRatio * 100}%`,
  }
}

function commonControlStyle(selected = false): string {
  return `h-full w-full rounded-[3px] border bg-paper-50/80 px-1.5 text-caption text-ink-800 shadow-sm outline-none transition-colors ${
    selected
      ? 'border-[color:var(--accent-sage)] ring-1 ring-[color:var(--accent-sage)]'
      : 'border-[color:var(--accent-sage)]/45 hover:border-[color:var(--accent-sage)]'
  }`
}

function valueAsText(value: PdfFormValue): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  return ''
}

function defaultRadioValue(field: PdfFormFieldDraft): string {
  return field.options?.[0] ?? 'Sí'
}

function renderFieldControl({
  ariaName,
  fieldKind,
  readOnly,
  selected,
  value,
  options,
  onChange,
  onOpenSignature,
}: {
  ariaName: string
  fieldKind: PdfFormFieldKind | PdfFormFieldType
  readOnly?: boolean
  selected?: boolean
  value: PdfFormValue
  options?: string[]
  onChange: (value: string | boolean) => void
  onOpenSignature?: () => void
}) {
  if (fieldKind === 'checkbox') {
    return (
      <label className="flex h-full w-full items-center justify-center rounded-[3px] border border-[color:var(--accent-sage)]/50 bg-paper-50/85 shadow-sm">
        <input
          type="checkbox"
          aria-label={ariaName}
          checked={value === true}
          disabled={readOnly}
          onChange={(event) => onChange(event.currentTarget.checked)}
          className="h-4 w-4 accent-[color:var(--accent-sage)]"
        />
      </label>
    )
  }

  if (fieldKind === 'radio') {
    const selectedValue = valueAsText(value)
    const option = options?.[0] ?? 'Sí'
    return (
      <label className="flex h-full w-full items-center justify-center rounded-[3px] border border-[color:var(--accent-sage)]/50 bg-paper-50/85 shadow-sm">
        <input
          type="radio"
          aria-label={ariaName}
          checked={selectedValue === option}
          disabled={readOnly}
          onChange={() => onChange(option)}
          className="h-4 w-4 accent-[color:var(--accent-sage)]"
        />
      </label>
    )
  }

  if (fieldKind === 'signature') {
    const text = valueAsText(value)
    return text.startsWith('data:image/') ? (
      <button
        type="button"
        aria-label={`Firmar ${ariaName}`}
        onClick={onOpenSignature}
        className="h-full w-full rounded-[3px] border border-[color:var(--accent-sage)]/50 bg-paper-50/85 p-1 shadow-sm"
      >
        <img src={text} alt="" className="h-full w-full object-contain" />
      </button>
    ) : (
      <button
        type="button"
        aria-label={`Firmar ${ariaName}`}
        onClick={onOpenSignature}
        className="h-full w-full rounded-[3px] border border-dashed border-[color:var(--accent-sage)]/70 bg-[color:var(--accent-sage-soft)]/40 text-caption font-medium text-[color:var(--accent-sage)]"
      >
        Firmar
      </button>
    )
  }

  if (fieldKind === 'dropdown' || fieldKind === 'option-list') {
    return (
      <select
        aria-label={ariaName}
        value={valueAsText(value)}
        disabled={readOnly}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={commonControlStyle(selected)}
      >
        {(options?.length ? options : [valueAsText(value)]).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      type={fieldKind === 'date' ? 'date' : 'text'}
      aria-label={ariaName}
      value={valueAsText(value)}
      readOnly={readOnly}
      onChange={(event) => onChange(event.currentTarget.value)}
      className={commonControlStyle(selected)}
    />
  )
}

export function FormFieldLayer({
  detectedWidgets,
  draftFields,
  selectedDraftId,
  onDetectedValueChange,
  onDraftValueChange,
  onSelectDraft,
  onStartDraftDrag,
  onStartDraftResize,
  onOpenSignature,
}: {
  detectedWidgets: VisualPdfFormWidget[]
  draftFields: PdfFormFieldDraft[]
  selectedDraftId: string | null
  onDetectedValueChange: (
    sourceId: string,
    fieldName: string,
    value: string | boolean,
  ) => void
  onDraftValueChange: (id: string, value: string | boolean) => void
  onSelectDraft: (id: string) => void
  onStartDraftDrag: (event: ReactPointerEvent, field: PdfFormFieldDraft) => void
  onStartDraftResize: (
    event: ReactPointerEvent,
    field: PdfFormFieldDraft,
    handle: ResizeHandle,
  ) => void
  onOpenSignature: (field: PdfFormFieldDraft) => void
}) {
  return (
    <>
      {detectedWidgets.map((widget) => (
        <div
          key={widget.id}
          style={boxStyle(widget)}
          className="z-10"
          title={`Campo ${widget.fieldName}`}
        >
          {renderFieldControl({
            ariaName: widget.fieldName,
            fieldKind: widget.type,
            readOnly: widget.readOnly,
            value: widget.value,
            options: widget.options,
            onChange: (value) =>
              onDetectedValueChange(widget.sourceId, widget.fieldName, value),
          })}
        </div>
      ))}

      {draftFields.map((field) => {
        const selected = selectedDraftId === field.id
        return (
          <div
            key={field.id}
            style={boxStyle(field)}
            className="z-20"
            onPointerDown={(event) => {
              event.stopPropagation()
              onSelectDraft(field.id)
              onStartDraftDrag(event, field)
            }}
            title={`Campo ${field.name}`}
          >
            {renderFieldControl({
              ariaName: field.name,
              fieldKind: field.fieldKind,
              readOnly: field.readOnly,
              selected,
              value:
                field.fieldKind === 'radio' && field.value == null
                  ? defaultRadioValue(field)
                  : field.value,
              options: field.options,
              onChange: (value) => onDraftValueChange(field.id, value),
              onOpenSignature: () => onOpenSignature(field),
            })}
            {selected &&
              handles.map((handle) => (
                <button
                  key={handle.key}
                  type="button"
                  aria-label={`Redimensionar campo ${field.name} desde ${handle.label}`}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    event.preventDefault()
                    onStartDraftResize(event, field, handle.key)
                  }}
                  className={`${stepBtn} absolute z-30 h-3 w-3 rounded-full border border-paper-50 bg-[color:var(--accent-sage)] p-0 text-transparent shadow-sm`}
                  style={{ ...handle.style, outlineColor: ACCENT }}
                />
              ))}
          </div>
        )
      })}
    </>
  )
}
