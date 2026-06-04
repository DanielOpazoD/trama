/**
 * Borde BROWSER-ONLY del editor de PDF: render de miniaturas con pdf.js.
 *
 * pdf.js depende de APIs del navegador (DOMMatrix, canvas, Worker) y no corre en
 * node/happy-dom — por eso este archivo está EXCLUIDO del coverage y el
 * componente que lo usa lo mockea en los tests. La librería se importa de forma
 * PEREZOSA (`await import('pdfjs-dist')`, ~1MB + worker) para no tocar el bundle
 * principal: sólo se baja cuando el usuario entra a la sección PDF y se renderiza
 * la primera miniatura.
 *
 * El worker se referencia con `?url` (Vite lo emite como asset aparte y nos da su
 * URL), de modo que pdf.js corre fuera del hilo principal sin inlinearlo.
 */
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

type Pdfjs = typeof import('pdfjs-dist')
type LoadingTask = ReturnType<Pdfjs['getDocument']>

let libPromise: Promise<Pdfjs> | null = null
async function getLib(): Promise<Pdfjs> {
  if (!libPromise) {
    libPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = workerUrl
      return lib
    })
  }
  return libPromise
}

// Cache del loading task de pdf.js por File (la misma File se comparte entre
// todas las páginas de un PDF importado → se abre una sola vez). Guardamos el
// task (no sólo el doc) para poder `destroy()`-lo al desmontar. La Promise se
// cachea de forma síncrona para deduplicar llamadas concurrentes.
const taskCache = new Map<File, Promise<LoadingTask>>()
function getTask(file: File): Promise<LoadingTask> {
  let p = taskCache.get(file)
  if (!p) {
    p = (async () => {
      const lib = await getLib()
      const data = new Uint8Array(await file.arrayBuffer())
      return lib.getDocument({ data })
    })()
    taskCache.set(file, p)
  }
  return p
}
async function getDoc(file: File) {
  return (await getTask(file)).promise
}

// Cache de miniaturas (object URLs) por clave estable (`pageThumbKey`). Es DUEÑO
// de los URLs: hay que revocarlos al desmontar la sección (`disposePdfStudio`).
const thumbCache = new Map<string, string>()

/** Cantidad de páginas de un PDF (para expandirlo en páginas en el modelo). */
export async function getPdfPageCount(file: File): Promise<number> {
  const doc = await getDoc(file)
  return doc.numPages
}

/**
 * Renderiza la página `pageIndex` (0-based) de `file` a una miniatura JPEG y
 * devuelve un object URL. Cacheado por `key`: si ya se renderizó, lo reusa.
 */
export async function renderPageThumb(
  file: File,
  pageIndex: number,
  key: string,
  maxWidth = 280,
): Promise<string> {
  const cached = thumbCache.get(key)
  if (cached) return cached

  const doc = await getDoc(file)
  const page = await doc.getPage(pageIndex + 1) // pdf.js es 1-based
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(1, maxWidth / base.width)
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(viewport.width))
  canvas.height = Math.max(1, Math.ceil(viewport.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.7),
  )
  if (!blob) throw new Error('No se pudo generar la miniatura')
  const url = URL.createObjectURL(blob)
  thumbCache.set(key, url)
  return url
}

/** Revoca y olvida la miniatura cacheada de una página (al borrarla). */
export function forgetThumb(key: string): void {
  const url = thumbCache.get(key)
  if (url) {
    URL.revokeObjectURL(url)
    thumbCache.delete(key)
  }
}

/** Limpia todo (miniaturas + documentos abiertos). Llamar al desmontar. */
export function disposePdfStudio(): void {
  for (const url of thumbCache.values()) URL.revokeObjectURL(url)
  thumbCache.clear()
  for (const p of taskCache.values()) {
    void p.then((task) => task.destroy()).catch(() => {})
  }
  taskCache.clear()
}
