import { type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { PdfFormFieldDraft, PdfFormValue } from '../../../lib/pdfStudio/model'
import type { ResizeHandle } from '../../../lib/pdfStudio/editorGeometry'
import type { PdfFormFieldType } from '../../../lib/pdfStudio/pdfForms'
import { ACCENT } from './editorStyle'
import { FillFieldLabel, FormFieldControl } from './FormFieldControl'
import { formFieldTextCss } from './pdfFormFieldStyle'

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
  { key: 'nw', label: 'esquina superior izquierda', style: { left: -4, top: -4 } },
  { key: 'ne', label: 'esquina superior derecha', style: { right: -4, top: -4 } },
  { key: 'sw', label: 'esquina inferior izquierda', style: { left: -4, bottom: -4 } },
  { key: 'se', label: 'esquina inferior derecha', style: { right: -4, bottom: -4 } },
]

type FormBox = Pick<PdfFormFieldDraft, 'xRatio' | 'yRatio' | 'wRatio' | 'hRatio'>
function boxStyle(box: FormBox): CSSProperties {
  return {
    position: 'absolute',
    left: `${box.xRatio * 100}%`,
    top: `${box.yRatio * 100}%`,
    width: `${box.wRatio * 100}%`,
    height: `${box.hRatio * 100}%`,
  }
}

function defaultRadioValue(field: PdfFormFieldDraft): string {
  return field.options?.[0] ?? 'Sí'
}

function isInteractiveFormTarget(target: EventTarget | null, fillMode: boolean): boolean {
  if (!fillMode) return false
  return target instanceof HTMLElement
    ? Boolean(target.closest('input, select, textarea, button'))
    : false
}

export function FormFieldLayer({
  detectedWidgets,
  draftFields,
  mode = 'edit',
  selectedDraftId,
  selectedDraftIds = selectedDraftId ? [selectedDraftId] : [],
  pageHeightPx = 1,
  zoom = 1,
  onDetectedValueChange,
  onDraftValueChange,
  onSelectDraft,
  onStartDraftDrag,
  onStartDraftResize,
  onOpenSignature,
}: {
  detectedWidgets: VisualPdfFormWidget[]
  draftFields: PdfFormFieldDraft[]
  mode?: 'edit' | 'fill'
  selectedDraftId: string | null
  selectedDraftIds?: string[]
  pageHeightPx?: number
  zoom?: number
  onDetectedValueChange: (
    sourceId: string,
    fieldName: string,
    value: string | boolean,
  ) => void
  onDraftValueChange: (id: string, value: string | boolean) => void
  onSelectDraft: (id: string, additive?: boolean) => void
  onStartDraftDrag: (event: ReactPointerEvent, field: PdfFormFieldDraft) => void
  onStartDraftResize: (
    event: ReactPointerEvent,
    field: PdfFormFieldDraft,
    handle: ResizeHandle,
  ) => void
  onOpenSignature: (field: PdfFormFieldDraft) => void
}) {
  const inverseZoom = 1 / Math.max(0.25, zoom)
  const handleSize = 8 * inverseZoom
  const handleOffset = -4 * inverseZoom
  const selectedSet = new Set(selectedDraftIds)
  return (
    <>
      {detectedWidgets.map((widget) => (
        <div
          key={widget.id}
          style={boxStyle(widget)}
          className="z-10"
          title={`Campo ${widget.fieldName}`}
        >
          {mode === 'fill' ? (
            <FillFieldLabel name={widget.fieldName} zoom={zoom} />
          ) : null}
          <FormFieldControl
            ariaName={widget.fieldName}
            controlId={widget.id}
            fieldKind={widget.type}
            mode={mode}
            readOnly={widget.readOnly}
            value={widget.value}
            zoom={zoom}
            options={widget.options}
            onChange={(value) =>
              onDetectedValueChange(widget.sourceId, widget.fieldName, value)
            }
          />
        </div>
      ))}

      {draftFields.map((field) => {
        const selected = selectedSet.has(field.id)
        const fillMode = mode === 'fill'
        const showHandles = !fillMode && selected && selectedDraftIds.length === 1
        return (
          <div
            key={field.id}
            style={boxStyle(field)}
            className="z-20"
            onPointerDown={(event) => {
              event.stopPropagation()
              if (fillMode) return
              event.preventDefault()
              onSelectDraft(field.id, event.shiftKey)
              if (isInteractiveFormTarget(event.target, fillMode)) return
              onStartDraftDrag(event, field)
            }}
            title={`Campo ${field.name}`}
          >
            {fillMode ? <FillFieldLabel name={field.name} zoom={zoom} /> : null}
            <FormFieldControl
              ariaName={field.name}
              controlId={field.id}
              fieldKind={field.fieldKind}
              mode={mode}
              readOnly={field.readOnly}
              selected={!fillMode && selected}
              zoom={zoom}
              textStyle={formFieldTextCss(field, pageHeightPx)}
              value={
                field.fieldKind === 'radio' && field.value == null
                  ? defaultRadioValue(field)
                  : field.value
              }
              options={field.options}
              onChange={(value) => onDraftValueChange(field.id, value)}
              onOpenSignature={() => onOpenSignature(field)}
            />
            {showHandles
              ? handles.map((handle) => (
                  <button
                    key={handle.key}
                    type="button"
                    aria-label={`Redimensionar campo ${field.name} desde ${handle.label}`}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      event.preventDefault()
                      onStartDraftResize(event, field, handle.key)
                    }}
                    className="absolute z-30 rounded-full border border-paper-50 bg-[color:var(--accent-sage)] p-0 text-transparent shadow-sm shadow-ink-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-sage)]"
                    style={{
                      ...handle.style,
                      left:
                        typeof handle.style.left === 'number'
                          ? handleOffset
                          : handle.style.left,
                      right:
                        typeof handle.style.right === 'number'
                          ? handleOffset
                          : handle.style.right,
                      top:
                        typeof handle.style.top === 'number'
                          ? handleOffset
                          : handle.style.top,
                      bottom:
                        typeof handle.style.bottom === 'number'
                          ? handleOffset
                          : handle.style.bottom,
                      width: handleSize,
                      height: handleSize,
                      outlineColor: ACCENT,
                    }}
                  />
                ))
              : null}
          </div>
        )
      })}
    </>
  )
}
