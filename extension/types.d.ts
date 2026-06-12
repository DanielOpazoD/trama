// Tipos ambient para la extensión, sin @types/chrome (el proxy npm bloquea
// paquetes nuevos). `chrome` queda laxo a propósito: no reimplementamos su API
// — lo que SÍ se type-checkea es NUESTRA lógica (payloads, resultados, flujos).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any

/** Payload de un recorte tal como lo recibe el backend (POST /api/recortes). */
interface RecortePayload {
  text: string
  sourceUrl: string | null
  sourceTitle: string | null
  sourceAuthor: string | null
  imageUrl: string | null
  imageKey: string | null
  captureMode: string
  note: string | null
  capturedAt: string
}

/** Argumentos del camino de guardado (buildPayload / saveRecorte). */
interface SaveArgs {
  text: string
  tab?: { id?: number; url?: string; title?: string } | null
  note?: string | null
  imageUrl?: string | null
  imageKey?: string | null
  captureMode?: string
  override?: {
    sourceUrl?: string | null
    sourceTitle?: string | null
    sourceAuthor?: string | null
  } | null
}
