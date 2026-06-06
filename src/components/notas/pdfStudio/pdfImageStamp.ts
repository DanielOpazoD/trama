import { fitImageStampBox, type PageLayout } from '../../../lib/pdfStudio/editorGeometry'
import { makeImageAnnotation, type ImageAnnotation } from '../../../lib/pdfStudio/model'

export const STAMP_ACCEPT = 'image/png,image/jpeg'

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('No se pudo leer la imagen'))
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer la imagen'))
    reader.readAsDataURL(file)
  })
}

function readImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () =>
      resolve({
        w: Math.max(1, im.naturalWidth || im.width),
        h: Math.max(1, im.naturalHeight || im.height),
      })
    im.onerror = () => reject(new Error('No se pudo decodificar la imagen'))
    im.src = src
  })
}

function isImageStampFile(file: File): boolean {
  return (
    file.type === 'image/png' ||
    file.type === 'image/jpeg' ||
    /\.(png|jpe?g)$/i.test(file.name)
  )
}

export async function createImageStampAnnotation({
  file,
  layout,
  opacity,
}: {
  file: File
  layout: PageLayout | null
  opacity?: number
}): Promise<ImageAnnotation | null> {
  if (!isImageStampFile(file)) return null
  const src = await fileToDataUrl(file)
  const size = await readImageSize(src)
  const box = fitImageStampBox({
    pageW: layout?.innerW ?? size.w,
    pageH: layout?.innerH ?? size.h,
    imageW: size.w,
    imageH: size.h,
  })
  return makeImageAnnotation({ src, ...box, opacity })
}
