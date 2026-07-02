import type {
  PdfFormFieldAlign,
  PdfFormFieldDraft,
  PdfFontKind,
} from '../../../../lib/pdfStudio/model/model'

/** Estilo inicial recordado para nuevos casilleros de texto. Se fija explícito
 *  desde el inspector ("usar como estilo inicial") y persiste por dispositivo. */
export type FormFieldStyleDefaults = {
  font?: PdfFontKind
  sizeRatio?: number
  bold?: boolean
  color?: string
  bgColor?: string
  borderColor?: string
  align?: PdfFormFieldAlign
}

const FONTS = new Set(['sans', 'serif', 'mono', 'script'])
const ALIGNS = new Set(['left', 'center', 'right'])
const HEX = /^#[0-9a-fA-F]{6}$/

function storageKey(userKey: string | undefined): string {
  return `trama:pdf-studio:field-style-defaults:${userKey ?? 'anon'}`
}

export function formFieldStyleDefaultsFromField(
  field: PdfFormFieldDraft,
): FormFieldStyleDefaults {
  return pruneStyleDefaults({
    font: field.font,
    sizeRatio: field.sizeRatio,
    bold: field.bold,
    color: field.color,
    bgColor: field.bgColor,
    borderColor: field.borderColor,
    align: field.align,
  })
}

const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX.test(value)

/** Valida un valor desconocido (storage puede venir corrupto) campo a campo. */
export function parseFormFieldStyleDefaults(raw: unknown): FormFieldStyleDefaults | null {
  if (typeof raw !== 'object' || raw === null) return null
  const input = raw as Record<string, unknown>
  const defaults = pruneStyleDefaults({
    font:
      typeof input.font === 'string' && FONTS.has(input.font)
        ? (input.font as PdfFontKind)
        : undefined,
    sizeRatio:
      typeof input.sizeRatio === 'number' && Number.isFinite(input.sizeRatio)
        ? input.sizeRatio
        : undefined,
    bold: typeof input.bold === 'boolean' ? input.bold : undefined,
    color: isHexColor(input.color) ? input.color : undefined,
    bgColor: isHexColor(input.bgColor) ? input.bgColor : undefined,
    borderColor: isHexColor(input.borderColor) ? input.borderColor : undefined,
    align:
      typeof input.align === 'string' && ALIGNS.has(input.align)
        ? (input.align as PdfFormFieldAlign)
        : undefined,
  })
  return Object.keys(defaults).length > 0 ? defaults : null
}

export function loadFormFieldStyleDefaults(
  userKey: string | undefined,
): FormFieldStyleDefaults | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userKey))
    if (!raw) return null
    return parseFormFieldStyleDefaults(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveFormFieldStyleDefaults(
  userKey: string | undefined,
  defaults: FormFieldStyleDefaults | null,
): void {
  try {
    if (!defaults || Object.keys(defaults).length === 0) {
      window.localStorage.removeItem(storageKey(userKey))
      return
    }
    window.localStorage.setItem(storageKey(userKey), JSON.stringify(defaults))
  } catch {
    // best-effort: el default queda solo en memoria si localStorage falla.
  }
}

function pruneStyleDefaults(defaults: FormFieldStyleDefaults): FormFieldStyleDefaults {
  return Object.fromEntries(
    Object.entries(defaults).filter(([, value]) => value !== undefined),
  ) as FormFieldStyleDefaults
}
