/**
 * Paquete portable de una plantilla: la estructura editable del `PdfDoc`
 * (páginas, casilleros, ajustes) más los archivos fuente en base64, en un solo
 * JSON. Es lo que sube/baja `/api/pdf-studio-templates` para que la biblioteca
 * de planillas funcione desde cualquier dispositivo.
 *
 * Sólo empaqueta plantillas LIMPIAS: `packPdfTemplate` borra cualquier valor de
 * casillero por diseño — las copias con datos nunca salen del dispositivo.
 */
import {
  clearPdfFormFieldValues,
  type DocSettings,
  type PdfDoc,
  type PdfFormFieldDraft,
  type PdfPage,
  type PdfSourceKind,
} from '../model/model'

export const TEMPLATE_PACKAGE_VERSION = 1

type PdfTemplatePackageSource = {
  id: string
  kind: PdfSourceKind
  name: string
  mime: string
  pageCount: number
  dataBase64: string
}

export type PdfTemplatePackage = {
  version: typeof TEMPLATE_PACKAGE_VERSION
  title?: string
  pages: PdfPage[]
  formFields: PdfFormFieldDraft[]
  settings?: DocSettings
  sources: PdfTemplatePackageSource[]
}

/** Serializa la plantilla a un paquete JSON-safe (los File pasan a base64). */
export async function packPdfTemplate(doc: PdfDoc): Promise<PdfTemplatePackage> {
  const clean = clearPdfFormFieldValues(doc)
  const sources: PdfTemplatePackageSource[] = []
  for (const source of clean.sources) {
    const buf = await source.file.arrayBuffer()
    sources.push({
      id: source.id,
      kind: source.kind,
      name: source.file.name || 'documento',
      mime: source.file.type || (source.kind === 'pdf' ? 'application/pdf' : 'image/png'),
      pageCount: source.pageCount,
      dataBase64: bytesToBase64(new Uint8Array(buf)),
    })
  }
  return {
    version: TEMPLATE_PACKAGE_VERSION,
    ...(clean.title ? { title: clean.title } : null),
    pages: clean.pages,
    formFields: clean.formFields ?? [],
    ...(clean.settings ? { settings: clean.settings } : null),
    sources,
  }
}

/** Reconstruye el `PdfDoc` editable desde un paquete. Devuelve null si el
 *  paquete no tiene la forma esperada (versión futura o JSON ajeno). */
export function unpackPdfTemplate(pkg: unknown): PdfDoc | null {
  if (!isTemplatePackage(pkg)) return null
  const sources = pkg.sources.map((source) => ({
    id: source.id,
    kind: source.kind,
    pageCount: source.pageCount,
    file: new File([base64ToBytes(source.dataBase64) as BlobPart], source.name, {
      type: source.mime,
    }),
  }))
  return {
    sources,
    pages: pkg.pages,
    formFields: pkg.formFields,
    ...(pkg.settings ? { settings: pkg.settings } : null),
    ...(pkg.title ? { title: pkg.title } : null),
  }
}

function isTemplatePackage(pkg: unknown): pkg is PdfTemplatePackage {
  if (typeof pkg !== 'object' || pkg === null) return false
  const candidate = pkg as Record<string, unknown>
  return (
    candidate.version === TEMPLATE_PACKAGE_VERSION &&
    Array.isArray(candidate.pages) &&
    Array.isArray(candidate.formFields) &&
    Array.isArray(candidate.sources) &&
    (candidate.sources as unknown[]).every(
      (source) =>
        typeof source === 'object' &&
        source !== null &&
        typeof (source as Record<string, unknown>).id === 'string' &&
        typeof (source as Record<string, unknown>).dataBase64 === 'string',
    )
  )
}

// btoa/atob operan sobre strings de bytes; el chunking evita reventar el stack
// de String.fromCharCode con PDFs de varios MB.
const BASE64_CHUNK = 0x8000

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK))
  }
  return btoa(binary)
}

function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
