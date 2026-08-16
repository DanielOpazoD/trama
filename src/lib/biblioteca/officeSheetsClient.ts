/**
 * Cliente del Worker de hojas de cálculo.
 *
 * A diferencia del resto de operaciones pesadas del repo, esto NO cae al hilo
 * principal cuando no hay Worker. El Worker no está acá para no bloquear la
 * interfaz —eso es un efecto secundario agradable—, está para que un `.xlsx`
 * malicioso no pueda ensuciar el realm de la aplicación. Un fallback al hilo
 * principal devolvería exactamente el riesgo que este módulo existe para quitar,
 * y en silencio. Si no hay Worker, la planilla no se previsualiza y se dice.
 */
import {
  OFFICE_SHEETS_TIMEOUT_MS,
  type OfficeSheet,
  type OfficeSheetsRequest,
  type OfficeSheetsResponse,
} from './officeSheetsContract'

export class OfficeSheetsUnavailableError extends Error {
  constructor() {
    super('Este navegador no puede abrir planillas de forma aislada.')
    this.name = 'OfficeSheetsUnavailableError'
  }
}

let nextId = 0

/**
 * Lee las hojas de `buffer` en un Worker de un solo uso. El Worker se termina
 * pase lo que pase: es lo que garantiza que la contaminación de prototipo no
 * sobreviva a la lectura.
 */
export function readOfficeSheets(buffer: ArrayBuffer): Promise<OfficeSheet[]> {
  if (typeof Worker === 'undefined') {
    return Promise.reject(new OfficeSheetsUnavailableError())
  }

  let worker: Worker
  try {
    worker = new Worker(new URL('./officeSheets.worker.ts', import.meta.url), {
      type: 'module',
    })
  } catch {
    return Promise.reject(new OfficeSheetsUnavailableError())
  }

  const id = ++nextId
  return new Promise<OfficeSheet[]>((resolve, reject) => {
    let settled = false
    const finish = (run: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      run()
    }

    const timer = setTimeout(() => {
      finish(() => reject(new Error('La planilla tardó demasiado en abrirse.')))
    }, OFFICE_SHEETS_TIMEOUT_MS)

    worker.onmessage = (event: MessageEvent<OfficeSheetsResponse>) => {
      const data = event.data
      if (data.id !== id) return
      finish(() => {
        if (data.ok) resolve(data.sheets)
        else reject(new Error(data.message))
      })
    }
    worker.onerror = () => {
      finish(() => reject(new Error('No se pudo leer la planilla.')))
    }

    const request: OfficeSheetsRequest = { id, buffer }
    // Se transfiere el buffer: evita copiar archivos grandes y deja claro que
    // el hilo principal ya no lo mira.
    worker.postMessage(request, [buffer])
  })
}
