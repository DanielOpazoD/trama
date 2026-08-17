/**
 * Exportar las fotos de un dueño (semana/tarea): bajar todas, o armar un PDF
 * con dos imágenes por hoja. Los blobs viven detrás de un endpoint autenticado,
 * así que se bajan con `requestBlob` (lleva el bearer de Clerk).
 *
 * El PDF lo arma `imagesToSheetPdfFile`, el MISMO ensamblador que usa Imprenta.
 * Antes esto tenía su propia implementación con jsPDF: dos maquetadores de
 * imágenes-a-hoja conviviendo, y 126 KB gzip de una librería que sólo se usaba
 * acá. pdf-lib ya viaja en la aplicación, así que la segunda sobraba.
 *
 * Se importa DINÁMICAMENTE, igual que antes se hacía con jsPDF: estático mete
 * el ensamblador y sus dependencias en el chunk de NotasWorld, que lo carga
 * cualquiera que entre al mundo Notas aunque no exporte una foto en su vida.
 */
import { requestBlob } from '../api/request'
import { downloadBlob } from './downloadBlob'

export type ExportablePhoto = { url: string; fileName: string }

async function fetchBlob(url: string): Promise<Blob> {
  return requestBlob(url)
}

/** Baja cada imagen como archivo, en serie (un respiro entre cada una para que
 *  el navegador no agrupe/bloquee las descargas). */
export async function downloadAllImages(photos: ExportablePhoto[]): Promise<void> {
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]!
    const blob = await fetchBlob(photo.url)
    downloadBlob(blob, photo.fileName)
    if (i < photos.length - 1) await new Promise((r) => setTimeout(r, 350))
  }
}

/**
 * Arma un PDF A4 con DOS imágenes por hoja (apiladas), cada una centrada en su
 * mitad manteniendo proporción. `title` da el nombre del archivo.
 *
 * El margen cambió de 12mm a 19mm al pasar al ensamblador compartido: es el que
 * usa Imprenta para lo mismo, y tener dos márgenes distintos para «dos fotos en
 * una hoja» era la clase de diferencia que nadie eligió.
 */
export async function exportImagesToPdf(
  photos: ExportablePhoto[],
  title: string,
): Promise<void> {
  if (photos.length === 0) return
  // EN SERIE, no con `Promise.all`: cada foto es una descarga autenticada, y
  // dispararlas todas a la vez le manda una ráfaga al backend y retiene todos
  // los blobs en memoria antes de empezar a ensamblar. Un dueño con cincuenta
  // fotos lo nota. Es además como bajaba el código anterior, y como sigue
  // bajando `downloadAllImages` unas líneas más arriba.
  const files: File[] = []
  for (const photo of photos) {
    const blob = await fetchBlob(photo.url)
    files.push(new File([blob], photo.fileName, { type: blob.type || 'image/jpeg' }))
  }
  const { imagesToSheetPdfFile } =
    await import('./pdfStudio/assemble/imagesToSheetPdfFile')
  const pdf = await imagesToSheetPdfFile(files, { imagesPerPage: 2 })
  // Los guiones de los bordes se recortan ANTES del respaldo: un título como
  // «///» se sanea a «-», que es truthy, y el archivo salía llamándose «-.pdf».
  const safe = (title || '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  downloadBlob(pdf, `${safe || 'fotos'}.pdf`)
}
