/** Contrato entre el visor de Office y el Worker que lee los archivos. */

export type OfficeKind = 'xlsx' | 'docx'

export type OfficeParseRequest = {
  id: number
  kind: OfficeKind
  /** Bytes del archivo tal cual se descargaron. Se transfieren, no se copian. */
  buffer: ArrayBuffer
}

/** HTML SIN sanitizar: lo sanitiza el hilo principal (ver el worker). */
export type OfficeSheet = { name: string; html: string }

export type OfficeParseResponse =
  | { id: number; ok: true; kind: 'xlsx'; sheets: OfficeSheet[] }
  | { id: number; ok: true; kind: 'docx'; html: string }
  | { id: number; ok: false; message: string }

/**
 * Tope de paciencia con un archivo. Nació por el ReDoS sin parche de `xlsx`:
 * una expresión regular patológica puede no terminar nunca, y sin este corte el
 * Worker quedaría girando y consumiendo CPU hasta que se cierre la pestaña.
 * Vale igual para `.docx`, que también es material arbitrario.
 */
export const OFFICE_PARSE_TIMEOUT_MS = 30_000
