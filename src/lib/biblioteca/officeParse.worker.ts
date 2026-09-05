/**
 * Worker que lee los documentos de Office de la Biblioteca.
 *
 * Acá adentro corre TODO el parseo de archivos que el usuario abre: hojas de
 * cálculo con `xlsx` y documentos de Word con `mammoth`. Son formatos binarios
 * complejos leídos por librerías grandes, sobre material que puede venir de
 * cualquier parte — un adjunto reenviado, una descarga—, y ese es el perfil de
 * riesgo que justifica el aislamiento aunque no haya un aviso abierto.
 *
 * `xlsx` sí lo tiene: contaminación de prototipo (GHSA-4r6h-8v6p-xvw6) y ReDoS
 * (GHSA-5pgg-2g8v-p4x9), ninguno con parche. Un Worker es un realm de
 * JavaScript propio: si el parseo ensucia `Object.prototype`, lo ensucia en
 * ESTE realm, que se termina en cuanto devuelve el resultado. La aplicación
 * —su estado, sus tokens, su DOM— vive en otro. Y un ReDoS que antes congelaba
 * la interfaz ahora sólo cuelga un hilo desechable con temporizador.
 *
 * Lo que cruza la frontera son strings inertes. El HTML sale SIN sanitizar a
 * propósito: DOMPurify necesita un DOM y acá no lo hay, así que sanitiza el
 * hilo principal justo antes de inyectarlo. Nadie debe insertar esto sin pasar
 * por ahí.
 */
import type { OfficeParseRequest, OfficeParseResponse } from './officeParseContract'

type MammothModule = {
  convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
}

async function loadMammoth(): Promise<MammothModule> {
  const mod = (await import('mammoth')) as unknown as
    MammothModule | { default: MammothModule }
  return 'convertToHtml' in mod ? mod : mod.default
}

self.onmessage = async (event: MessageEvent<OfficeParseRequest>) => {
  const { id, kind, buffer } = event.data
  const post = (message: OfficeParseResponse) =>
    (self as unknown as Worker).postMessage(message)
  try {
    if (kind === 'docx') {
      const mammoth = await loadMammoth()
      const { value } = await mammoth.convertToHtml({ arrayBuffer: buffer })
      post({ id, ok: true, kind, html: value })
      return
    }
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name]
      return { name, html: sheet ? XLSX.utils.sheet_to_html(sheet) : '' }
    })
    post({ id, ok: true, kind, sheets })
  } catch (error) {
    post({
      id,
      ok: false,
      message: error instanceof Error ? error.message : 'no se pudo leer el archivo',
    })
  }
}
