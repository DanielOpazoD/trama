/**
 * Etiquetado de casilleros sugeridos con la CAPA DE TEXTO del PDF: a cada
 * casillero detectado (subrayado vacío) se le busca la etiqueta impresa a su
 * izquierda en la misma fila ("Nombre:", "RUT", "Fecha de nacimiento") y esa
 * etiqueta pasa a ser el nombre de la variable; palabras clave infieren el
 * tipo (fecha → date, firma → signature). Los subrayados que ya tienen texto
 * encima (línea de texto subrayado, no un espacio para llenar) se descartan.
 * Todo puro y en ratios de página; la extracción browser-only vive en
 * render/pdfRender.
 */
import type { PdfFormFieldDraft, PdfFormFieldKind } from '../model/modelTypes'

export type PageTextItemRatio = {
  text: string
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
}

type RatioBox = Pick<PdfFormFieldDraft, 'xRatio' | 'yRatio' | 'wRatio' | 'hRatio'>

/** Solape vertical entre el item y la caja (como fracción del alto del item). */
function rowOverlap(item: PageTextItemRatio, box: RatioBox): number {
  const top = Math.max(item.yRatio, box.yRatio)
  const bottom = Math.min(item.yRatio + item.hRatio, box.yRatio + box.hRatio)
  return item.hRatio > 0 ? Math.max(0, bottom - top) / item.hRatio : 0
}

function sameRowItems(items: PageTextItemRatio[], box: RatioBox): PageTextItemRatio[] {
  return items.filter((item) => rowOverlap(item, box) >= 0.5)
}

/** ¿El subrayado ya tiene texto encima? (texto subrayado, no espacio vacío). */
function hasTextInside(items: PageTextItemRatio[], box: RatioBox): boolean {
  return sameRowItems(items, box).some((item) => {
    const left = Math.max(item.xRatio, box.xRatio)
    const right = Math.min(item.xRatio + item.wRatio, box.xRatio + box.wRatio)
    const overlap = Math.max(0, right - left)
    return overlap >= item.wRatio * 0.6 && overlap >= box.wRatio * 0.25
  })
}

const MAX_LABEL_GAP = 0.1
const MAX_WORD_GAP = 0.02
// Una etiqueta real es corta; más que esto es un párrafo con un blanco
// adentro ("Yo ___ declaro…") y ahí el nombre genérico es más honesto.
const MAX_LABEL_WORDS = 5
const MAX_LABEL_CHARS = 48

/** Items cuyo centro vertical cae SOBRE la línea del subrayado (la caja del
 *  casillero es más alta que una línea de texto: comparar contra la caja
 *  entera mezcla renglones vecinos y revuelve el orden). */
function itemsOnUnderlineRow(
  items: PageTextItemRatio[],
  box: RatioBox,
): PageTextItemRatio[] {
  // El subrayado queda a ~62% del alto de la caja (initialBox lo posiciona así).
  const lineY = box.yRatio + box.hRatio * 0.62
  return items.filter((item) => {
    const center = item.yRatio + item.hRatio / 2
    return Math.abs(center - lineY) <= Math.max(item.hRatio * 0.8, 0.008)
  })
}

/** Etiqueta a la izquierda del casillero: el item más cercano que termina
 *  justo antes de la caja, extendido hacia la izquierda con los items
 *  contiguos del mismo renglón. */
function labelLeftOf(items: PageTextItemRatio[], box: RatioBox): string | null {
  const row = itemsOnUnderlineRow(items, box)
    .filter((item) => item.xRatio + item.wRatio <= box.xRatio + 0.015)
    .sort((a, b) => a.xRatio - b.xRatio)
  const last = row[row.length - 1]
  if (!last) return null
  if (box.xRatio - (last.xRatio + last.wRatio) > MAX_LABEL_GAP) return null
  const parts = [last]
  for (let i = row.length - 2; i >= 0; i -= 1) {
    const current = row[i]!
    const gap = parts[0]!.xRatio - (current.xRatio + current.wRatio)
    if (gap > MAX_WORD_GAP || parts.length >= MAX_LABEL_WORDS) break
    parts.unshift(current)
  }
  const label = parts.map((part) => part.text).join(' ')
  return label.length > MAX_LABEL_CHARS ? null : label
}

/** Limpia la etiqueta para usarla como nombre de variable legible. */
export function cleanFieldLabel(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[:：_.]+\s*$/g, '')
    .replace(/^[-–—•·*]+\s*/g, '')
    .trim()
    .slice(0, 60)
}

function inferFieldKind(label: string): PdfFormFieldKind {
  if (/\bfecha\b|\bdate\b/i.test(label)) return 'date'
  if (/\bfirma\b|\bsignature\b/i.test(label)) return 'signature'
  return 'text'
}

/** «Fecha» a secas (o de hoy/emisión/atención/consulta) se llena sola al
 *  rellenar; una fecha de nacimiento o vencimiento jamás. */
function inferAutoFill(label: string): 'today' | undefined {
  return /^fecha(\s+de\s+(hoy|emisi[oó]n|atenci[oó]n|consulta))?$/i.test(label.trim())
    ? 'today'
    : undefined
}

/**
 * Renombra y retipa los casilleros sugeridos según las etiquetas del PDF y
 * descarta los que ya tienen texto encima. Los que no encuentran etiqueta
 * conservan su nombre genérico (`campo_N`).
 */
export function labelSuggestedFields({
  fields,
  items,
}: {
  fields: PdfFormFieldDraft[]
  items: PageTextItemRatio[]
}): PdfFormFieldDraft[] {
  const usable = items.filter((item) => item.text.trim().length > 0)
  return fields
    .filter((field) => !hasTextInside(usable, field))
    .map((field) => {
      const label = labelLeftOf(usable, field)
      const clean = label ? cleanFieldLabel(label) : ''
      // Una etiqueta real tiene al menos una palabra de 3+ letras: descarta
      // basura del OCR ("no_a", "|—:", restos de líneas).
      if (clean.length < 2 || !/[a-zA-ZáéíóúñÁÉÍÓÚÑüÜ]{3,}/.test(clean)) return field
      const fieldKind = inferFieldKind(clean)
      const autoFill = fieldKind === 'date' ? inferAutoFill(clean) : undefined
      return {
        ...field,
        name: clean,
        fieldKind,
        ...(autoFill ? { autoFill } : null),
      }
    })
}
