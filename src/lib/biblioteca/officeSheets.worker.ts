/**
 * Worker de hojas de cálculo de la Biblioteca.
 *
 * `xlsx` (SheetJS) arrastra dos avisos ALTOS sin parche disponible:
 * contaminación de prototipo (GHSA-4r6h-8v6p-xvw6) y ReDoS
 * (GHSA-5pgg-2g8v-p4x9). Los dos se disparan al leer el archivo, que es
 * material arbitrario que el usuario abre desde su biblioteca.
 *
 * Correrlo acá cambia lo que un archivo malicioso puede alcanzar. Un Worker es
 * un realm de JavaScript propio: si el parseo ensucia `Object.prototype`, lo
 * ensucia en ESTE realm, que se termina en cuanto devuelve el resultado. La
 * aplicación —su estado, sus tokens, su DOM— vive en otro. Y un ReDoS que antes
 * congelaba la interfaz ahora sólo cuelga un hilo desechable con temporizador.
 *
 * Lo que cruza la frontera son strings inertes. El HTML sale SIN sanitizar a
 * propósito: DOMPurify necesita un DOM y acá no lo hay, así que sanitiza el
 * hilo principal justo antes de inyectarlo. Nadie debe insertar esto sin pasar
 * por ahí.
 */
import type { OfficeSheetsRequest, OfficeSheetsResponse } from './officeSheetsContract'

self.onmessage = async (event: MessageEvent<OfficeSheetsRequest>) => {
  const { id, buffer } = event.data
  const post = (message: OfficeSheetsResponse) =>
    (self as unknown as Worker).postMessage(message)
  try {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name]
      return { name, html: sheet ? XLSX.utils.sheet_to_html(sheet) : '' }
    })
    post({ id, ok: true, sheets })
  } catch (error) {
    post({
      id,
      ok: false,
      message: error instanceof Error ? error.message : 'no se pudo leer la planilla',
    })
  }
}
