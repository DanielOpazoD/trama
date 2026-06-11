import { computeLayout, type LayoutComputeRequest } from './layoutCompute'

/**
 * Worker de layout del grafo: recibe el pedido serializado, computa con
 * las mismas funciones puras del hilo principal y devuelve las posiciones.
 * `seq` permite descartar respuestas viejas si llegan fuera de orden.
 */
self.onmessage = (event: MessageEvent<{ seq: number; req: LayoutComputeRequest }>) => {
  const { seq, req } = event.data
  const entries = computeLayout(req)
  ;(self as unknown as Worker).postMessage({ seq, entries })
}
