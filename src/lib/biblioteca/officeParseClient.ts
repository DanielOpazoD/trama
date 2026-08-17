/**
 * Cliente del Worker que lee documentos de Office.
 *
 * A diferencia del resto de operaciones pesadas del repo, esto NO cae al hilo
 * principal cuando no hay Worker. El Worker no está acá para no bloquear la
 * interfaz —eso es un efecto secundario agradable—, está para que un archivo
 * malicioso no pueda ensuciar el realm de la aplicación. Un fallback al hilo
 * principal devolvería exactamente el riesgo que este módulo existe para quitar,
 * y en silencio. Si no hay Worker, el archivo no se previsualiza y se dice.
 */
import {
  OFFICE_PARSE_TIMEOUT_MS,
  type OfficeKind,
  type OfficeParseRequest,
  type OfficeParseResponse,
  type OfficeSheet,
} from './officeParseContract'

export class OfficeParseUnavailableError extends Error {
  constructor() {
    super('Este navegador no puede abrir el archivo de forma aislada.')
    this.name = 'OfficeParseUnavailableError'
  }
}

let nextId = 0

/**
 * Manda `buffer` a un Worker de un solo uso y devuelve su respuesta. El Worker
 * se termina pase lo que pase: es lo que garantiza que la contaminación de
 * prototipo no sobreviva a la lectura.
 */
function parseInWorker(
  kind: OfficeKind,
  buffer: ArrayBuffer,
): Promise<OfficeParseResponse> {
  if (typeof Worker === 'undefined') {
    return Promise.reject(new OfficeParseUnavailableError())
  }

  let worker: Worker
  try {
    worker = new Worker(new URL('./officeParse.worker.ts', import.meta.url), {
      type: 'module',
    })
  } catch {
    return Promise.reject(new OfficeParseUnavailableError())
  }

  const id = ++nextId
  return new Promise<OfficeParseResponse>((resolve, reject) => {
    let settled = false
    const finish = (run: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      run()
    }

    const timer = setTimeout(() => {
      finish(() => reject(new Error('El archivo tardó demasiado en abrirse.')))
    }, OFFICE_PARSE_TIMEOUT_MS)

    worker.onmessage = (event: MessageEvent<OfficeParseResponse>) => {
      const data = event.data
      if (data.id !== id) return
      finish(() => {
        if (data.ok) resolve(data)
        else reject(new Error(data.message))
      })
    }
    worker.onerror = () => {
      finish(() => reject(new Error('No se pudo leer el archivo.')))
    }

    const request: OfficeParseRequest = { id, kind, buffer }
    // Se transfiere el buffer: evita copiar archivos grandes y deja claro que
    // el hilo principal ya no lo mira.
    worker.postMessage(request, [buffer])
  })
}

/** Hojas de una planilla, en HTML sin sanitizar. */
export async function readOfficeSheets(buffer: ArrayBuffer): Promise<OfficeSheet[]> {
  const response = await parseInWorker('xlsx', buffer)
  if (!response.ok || response.kind !== 'xlsx') {
    throw new Error('respuesta inesperada del worker de planillas')
  }
  return response.sheets
}

/** Documento de Word convertido a HTML sin sanitizar. */
export async function readOfficeDocument(buffer: ArrayBuffer): Promise<string> {
  const response = await parseInWorker('docx', buffer)
  if (!response.ok || response.kind !== 'docx') {
    throw new Error('respuesta inesperada del worker de documentos')
  }
  return response.html
}
