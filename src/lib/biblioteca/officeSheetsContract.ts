/** Contrato entre el visor de Office y el Worker que lee hojas de cálculo. */

export type OfficeSheetsRequest = {
  id: number
  /** Bytes del archivo tal cual se descargaron. Se transfieren, no se copian. */
  buffer: ArrayBuffer
}

/** HTML por hoja, SIN sanitizar: lo sanitiza el hilo principal (ver el worker). */
export type OfficeSheet = { name: string; html: string }

export type OfficeSheetsResponse =
  | { id: number; ok: true; sheets: OfficeSheet[] }
  | { id: number; ok: false; message: string }

/**
 * Tope de paciencia con una planilla. Existe por el ReDoS sin parche: una
 * expresión regular patológica puede no terminar nunca, y sin este corte el
 * Worker quedaría girando y consumiendo CPU hasta que se cierre la pestaña.
 */
export const OFFICE_SHEETS_TIMEOUT_MS = 30_000
