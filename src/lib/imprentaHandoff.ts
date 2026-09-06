/**
 * Entrega de archivos a Imprenta ENTRE mundos.
 *
 * Dentro del mundo Notas, quien manda imágenes a Imprenta (el feed, una nota,
 * Biblioteca) lo hace por props: `NotasWorld` conoce el documento en curso y
 * entrega los `File` al estudio. Momentos vive en el otro mundo: no tiene a
 * `NotasWorld` montado ni forma de pasarle nada. Los `File` no se pueden
 * serializar en la URL ni en `localStorage` sin duplicar los blobs, así que
 * viajan por esta cola en memoria durante la sesión: el remitente encola y
 * avisa; el shell cambia de mundo; `NotasWorld` drena al montar. Si el usuario
 * recarga a mitad de camino, simplemente vuelve a enviar.
 *
 * Es la idea del PR #235 (cerrado como superado), traída para el único origen
 * que de verdad la necesita.
 */
export const IMPRENTA_HANDOFF_EVENT = 'trama:imprenta-handoff'

let queued: File[] = []

export function handOffFilesToImprenta(files: File[]): void {
  if (files.length === 0) return
  queued = [...queued, ...files]
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(IMPRENTA_HANDOFF_EVENT, { detail: { count: files.length } }),
    )
  }
}

export function takeHandedOffImprentaFiles(): File[] {
  const out = queued
  queued = []
  return out
}

export function hasHandedOffImprentaFiles(): boolean {
  return queued.length > 0
}
