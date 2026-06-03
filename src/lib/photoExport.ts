/**
 * Exportar las fotos de un dueño (semana/tarea): bajar todas, o armar un PDF
 * con dos imágenes por hoja. Los blobs viven detrás de un endpoint autenticado,
 * así que se bajan con `apiFetch` (lleva el bearer de Clerk). jsPDF se importa
 * de forma perezosa para no engordar el bundle principal (solo se carga al
 * exportar).
 */
import { apiFetch } from '../api/request'

export type ExportablePhoto = { url: string; fileName: string }

async function fetchBlob(url: string): Promise<Blob> {
  const res = await apiFetch(url)
  if (!res.ok) throw new Error(`No se pudo bajar la imagen (${res.status})`)
  return res.blob()
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Baja cada imagen como archivo, en serie (un respiro entre cada una para que
 *  el navegador no agrupe/bloquee las descargas). */
export async function downloadAllImages(photos: ExportablePhoto[]): Promise<void> {
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]!
    const blob = await fetchBlob(photo.url)
    triggerDownload(blob, photo.fileName)
    if (i < photos.length - 1) await new Promise((r) => setTimeout(r, 350))
  }
}

/** Carga un blob a un <img> para conocer sus dimensiones naturales. */
function loadImage(blobUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = blobUrl
  })
}

/** Re-encodea a JPEG vía canvas (jsPDF embebe JPEG/PNG de forma confiable; WebP
 *  no siempre). Cap de dimensión para que el PDF no pese de más. */
async function toJpeg(
  blob: Blob,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const blobUrl = URL.createObjectURL(blob)
  try {
    const img = await loadImage(blobUrl)
    const MAX = 1600
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight))
    const width = Math.max(1, Math.round(img.naturalWidth * scale))
    const height = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible')
    // Fondo blanco: imágenes con transparencia no salen negras en el PDF.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), width, height }
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

/**
 * Arma un PDF A4 con DOS imágenes por hoja (apiladas), cada una centrada en su
 * mitad manteniendo proporción. `title` da el nombre del archivo.
 */
export async function exportImagesToPdf(
  photos: ExportablePhoto[],
  title: string,
): Promise<void> {
  if (photos.length === 0) return
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const pageW = 210
  const pageH = 297
  const margin = 12
  const gap = 8
  const slotW = pageW - margin * 2
  const slotH = (pageH - margin * 2 - gap) / 2 // dos slots verticales

  for (let i = 0; i < photos.length; i++) {
    const blob = await fetchBlob(photos[i]!.url)
    const { dataUrl, width, height } = await toJpeg(blob)
    const slot = i % 2 // 0 = arriba, 1 = abajo
    if (i > 0 && slot === 0) doc.addPage()

    const scale = Math.min(slotW / width, slotH / height)
    const drawW = width * scale
    const drawH = height * scale
    const x = margin + (slotW - drawW) / 2
    const y = margin + slot * (slotH + gap) + (slotH - drawH) / 2
    doc.addImage(dataUrl, 'JPEG', x, y, drawW, drawH)
  }

  const safe = (title || 'fotos').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60)
  doc.save(`${safe || 'fotos'}.pdf`)
}
