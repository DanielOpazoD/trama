import type { CSSProperties } from 'react'
import type {
  PdfFormFieldKind,
  PdfFormValue,
} from '../../../../lib/pdfStudio/model/model'
import type { PdfFormFieldType } from '../../../../lib/pdfStudio/forms/pdfForms'
import { FORM_FIELD_EMPTY_HINT } from './pdfFormFieldStyle'

function valueAsText(value: PdfFormValue): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  return ''
}

function controlFrameStyle(mode?: 'edit' | 'design' | 'fill'): string {
  return mode === 'fill'
    ? 'flex h-full w-full items-center justify-center rounded border border-[color:var(--accent-sage)] bg-paper-50/95 shadow-sm shadow-ink-900/10'
    : 'flex h-full w-full items-center justify-center rounded-sm border border-[color:var(--accent-sage)]/50 bg-paper-50/70'
}

function commonControlStyle(selected = false, fillMode = false): string {
  if (fillMode) {
    return [
      'h-full w-full rounded-none border-0',
      'bg-transparent px-1.5 text-caption font-medium text-ink-900 shadow-none',
      'outline-none transition-colors placeholder:text-[color:var(--accent-sage)]/80',
      'focus:bg-paper-50/45 focus:ring-1 focus:ring-[color:var(--accent-sage)]/25',
    ].join(' ')
  }
  return `h-full w-full rounded-sm border bg-paper-50/80 px-1.5 text-caption text-ink-800 shadow-sm outline-none transition-colors ${
    selected
      ? 'border-[color:var(--accent-sage)] bg-paper-50/90'
      : 'border-[color:var(--accent-sage)]/40 hover:border-[color:var(--accent-sage)]/75'
  }`
}

function zoomSafeScale(zoom = 1): number {
  return 1 / Math.max(0.25, zoom)
}

function frameVisualStyle(zoom = 1, fillMode = false): CSSProperties {
  const k = zoomSafeScale(zoom)
  return {
    borderWidth: `${k}px`,
    borderRadius: `${(fillMode ? 4 : 3) * k}px`,
  }
}

export function FillFieldLabel({
  index,
  name,
  zoom = 1,
}: {
  index: number
  name: string
  zoom?: number
}) {
  const k = zoomSafeScale(zoom)
  return (
    <span
      aria-label={`Campo ${index}: ${name}`}
      className="pointer-events-none absolute z-10 rounded bg-[color:var(--accent-sage)] font-semibold leading-none text-paper-50 shadow-sm shadow-ink-900/15"
      style={{
        right: `${-4 * k}px`,
        top: '50%',
        transform: 'translate(100%, -50%)',
        padding: `${2 * k}px ${5 * k}px`,
        fontSize: `${10 * k}px`,
        borderRadius: `${3 * k}px`,
      }}
    >
      #{index}
    </span>
  )
}

export function FormFieldControl({
  ariaName,
  controlId,
  fieldKind,
  mode,
  readOnly,
  selected,
  value,
  zoom = 1,
  options,
  onChange,
  onFocus,
  onOpenSignature,
  textStyle,
}: {
  ariaName: string
  controlId?: string
  fieldKind: PdfFormFieldKind | PdfFormFieldType
  mode?: 'edit' | 'design' | 'fill'
  readOnly?: boolean
  selected?: boolean
  value: PdfFormValue
  zoom?: number
  options?: string[]
  onChange: (value: string | boolean) => void
  onFocus?: () => void
  onOpenSignature?: () => void
  textStyle?: CSSProperties
}) {
  if (fieldKind === 'checkbox') {
    const fillMode = mode === 'fill'
    return (
      <label className={controlFrameStyle(mode)} style={frameVisualStyle(zoom, fillMode)}>
        <input
          data-form-field-control={controlId}
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
    const fillMode = mode === 'fill'
    return (
      <label className={controlFrameStyle(mode)} style={frameVisualStyle(zoom, fillMode)}>
        <input
          data-form-field-control={controlId}
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
    const fillMode = mode === 'fill'
    const signatureStyle = frameVisualStyle(zoom, fillMode)
    return text.startsWith('data:image/') ? (
      <button
        type="button"
        data-form-field-control={controlId}
        aria-label={`Firmar ${ariaName}`}
        onClick={onOpenSignature}
        className={`${controlFrameStyle(mode)} p-1`}
        style={signatureStyle}
      >
        <img src={text} alt="" className="h-full w-full object-contain" />
      </button>
    ) : (
      <button
        type="button"
        data-form-field-control={controlId}
        aria-label={`Firmar ${ariaName}`}
        onClick={onOpenSignature}
        className={
          fillMode
            ? 'h-full w-full rounded border border-dashed border-[color:var(--accent-sage)] bg-[color:var(--accent-sage-soft)]/65 text-caption font-semibold text-[color:var(--accent-sage)] shadow-sm shadow-ink-900/10'
            : 'h-full w-full rounded-sm border border-dashed border-[color:var(--accent-sage)]/70 bg-[color:var(--accent-sage-soft)]/40 text-caption font-medium text-[color:var(--accent-sage)]'
        }
        style={signatureStyle}
      >
        Firmar
      </button>
    )
  }

  if (fieldKind === 'dropdown' || fieldKind === 'option-list') {
    return (
      <select
        data-form-field-control={controlId}
        aria-label={ariaName}
        value={valueAsText(value)}
        disabled={readOnly}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={commonControlStyle(selected, mode === 'fill')}
        style={frameVisualStyle(zoom, mode === 'fill')}
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
      data-form-field-control={controlId}
      type={fieldKind === 'date' ? 'date' : 'text'}
      aria-label={ariaName}
      value={valueAsText(value)}
      placeholder={FORM_FIELD_EMPTY_HINT}
      readOnly={readOnly}
      onFocus={() => {
        onFocus?.()
        if (mode === 'fill' && valueAsText(value) === FORM_FIELD_EMPTY_HINT) {
          onChange('')
        }
      }}
      onChange={(event) => onChange(event.currentTarget.value)}
      className={commonControlStyle(selected, mode === 'fill')}
      style={{
        ...frameVisualStyle(zoom, mode === 'fill'),
        ...(mode === 'fill' ? { borderWidth: 0, borderRadius: 0 } : null),
        ...textStyle,
      }}
    />
  )
}
