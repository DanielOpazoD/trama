import type { LibraryItem } from '../../../types/biblioteca'
import { libraryItemServeUrl } from '../../../api/biblioteca'

/**
 * Adaptador de "enviar a Momentos" para la Biblioteca — análogo de
 * {@link libraryItemsToPdfFiles}. Toma los items seleccionados, baja el blob de
 * cada uno por su URL de servir autenticada, lo re-sube al store de Momentos y
 * devuelve los `items[]` listos para el payload de un momento `kind='foto'`.
 *
 * **Por qué re-subir y no reusar la storageKey.** Los blobs de la Biblioteca
 * viven en otros dominios (`library-uploads`, `notas-attachments`,
 * `recortes-media`), y el barrido de huérfanos de Momentos razona sobre las
 * claves de SU store. Apuntar un momento a una clave ajena crearía un dueño
 * compartido invisible: borrar el adjunto original dejaría el momento con una
 * foto rota. Copiar cuesta una subida y deja cada dominio dueño de lo suyo.
 *
 * Las dimensiones se leen del blob ya descargado (a diferencia de Imprenta, que
 * no las necesita): `LibraryItem` no las trae, y sin ellas el render pierde el
 * aspect-ratio y la grilla salta al cargar.
 */

/** Item del payload `foto` — espejo de `FotoItemSchema`. */
type MomentoMediaItem = {
  storageKey: string
  width?: number
  height?: number
  type?: 'image' | 'video'
}

type MomentoImportFailure = {
  /** Id compuesto del item (`${kind}:${itemId}`), para diagnóstico. */
  id: string
  reason: string
}

export type LibraryItemsToMomentoItemsResult = {
  items: MomentoMediaItem[]
  failures: MomentoImportFailure[]
}

type Dimensions = { width: number; height: number }

type LibraryItemsToMomentoItemsOptions = {
  fetchBlob: (url: string) => Promise<Blob>
  uploadMedia: (file: File) => Promise<{ storageKey: string }>
  readImageDimensions: (file: File) => Promise<Dimensions>
  readVideoDimensions: (file: File) => Promise<Dimensions>
}

/** ¿El item ya ES una foto de Momentos? La Biblioteca proyecta el store de
 *  Momentos, así que estos items ya están allá; reenviarlos duplicaría el
 *  episodio en vez de agregar algo. */
function libraryItemIsMomentoMedia(item: LibraryItem): boolean {
  return item.kind === 'momento-foto'
}

/** ¿Es un video? Decide `type: 'video'` en el payload y qué lector de
 *  dimensiones usar. `fileType` manda porque el servidor ya lo derivó del mime;
 *  el mime queda de respaldo para items viejos sin `fileType` confiable. */
export function libraryItemIsVideo(item: LibraryItem): boolean {
  return (
    item.fileType === 'video' || (item.mimeType?.toLowerCase() ?? '').startsWith('video/')
  )
}

/**
 * ¿Momentos puede ingerir este item? Solo media visual —imágenes y videos, lo
 * mismo que acepta el composer— y solo si es servible (tiene URL de blob). Se
 * excluyen las fotos que YA son de Momentos: ver {@link libraryItemIsMomentoMedia}.
 *
 * Puro y testeable: la barra de selección lo reusa para habilitar/deshabilitar
 * "Enviar a Momentos" sin duplicar la regla.
 */
export function canSendLibraryItemToMomentos(item: LibraryItem): boolean {
  if (libraryItemServeUrl(item) === null) return false
  if (libraryItemIsMomentoMedia(item)) return false
  const mime = item.mimeType?.toLowerCase() ?? ''
  return (
    item.fileType === 'image' ||
    item.fileType === 'video' ||
    mime.startsWith('image/') ||
    mime.startsWith('video/')
  )
}

function failureReason(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo enviar'
}

/**
 * Baja, re-sube y arma los `items[]` del momento. Los no ingeribles se omiten en
 * silencio (la barra ya los excluyó del conteo); los que fallan al bajar o al
 * subir quedan en `failures` — mismo contrato de éxito parcial que
 * `libraryItemsToPdfFiles`.
 *
 * Secuencial a propósito: son subidas completas, y en paralelo compiten por
 * ancho de banda con el resto de la app sin que el usuario gane nada (el toast
 * solo aparece al final). Además mantiene el orden de la selección.
 */
export async function libraryItemsToMomentoItems(
  items: LibraryItem[],
  {
    fetchBlob,
    uploadMedia,
    readImageDimensions,
    readVideoDimensions,
  }: LibraryItemsToMomentoItemsOptions,
): Promise<LibraryItemsToMomentoItemsResult> {
  const media: MomentoMediaItem[] = []
  const failures: MomentoImportFailure[] = []

  for (const item of items) {
    const url = libraryItemServeUrl(item)
    if (!url || !canSendLibraryItemToMomentos(item)) continue
    try {
      const blob = await fetchBlob(url)
      const file = new File([blob], item.title, { type: item.mimeType ?? '' })
      const isVideo = libraryItemIsVideo(item)
      // Las dimensiones son best-effort: si el lector falla o devuelve 0 (un
      // codec que el navegador no decodifica, por ejemplo), el item va sin
      // ellas — el render tiene fallback. Un video ilegible no debe costar
      // la subida entera.
      const dims = await (
        isVideo ? readVideoDimensions(file) : readImageDimensions(file)
      ).catch(() => ({ width: 0, height: 0 }))
      const uploaded = await uploadMedia(file)
      media.push({
        storageKey: uploaded.storageKey,
        width: dims.width || undefined,
        height: dims.height || undefined,
        ...(isVideo ? { type: 'video' as const } : {}),
      })
    } catch (error) {
      failures.push({ id: item.id, reason: failureReason(error) })
    }
  }

  return { items: media, failures }
}
