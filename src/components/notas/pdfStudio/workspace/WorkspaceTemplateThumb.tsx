import { useEffect, useState } from 'react'
import {
  getSource,
  pageThumbKey,
  type PdfDoc,
  type PdfPage,
} from '../../../../lib/pdfStudio/model/model'
import { renderPageThumb } from '../../../../lib/pdfStudio/render/pdfRender'
import { FilePdfIcon } from '../../../Icons'

export function WorkspaceTemplateThumb({ doc }: { doc: PdfDoc }) {
  const page = doc.pages[0]
  const source = page ? getSource(doc, page.sourceId) : undefined
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!page || !source) return
    let alive = true
    if (page.kind === 'image') {
      const u = URL.createObjectURL(source.file)
      setUrl(u)
      return () => {
        alive = false
        URL.revokeObjectURL(u)
      }
    }
    setUrl(null)
    renderPdfTemplateThumb(source.file, page)
      .then((u) => {
        if (alive) setUrl(u)
      })
      .catch((error) => {
        console.warn('No se pudo renderizar miniatura de planilla PDF.', error)
      })
    return () => {
      alive = false
    }
  }, [page, source])

  return url ? (
    <img
      src={url}
      alt=""
      className="h-full w-full object-contain p-1"
      draggable={false}
    />
  ) : (
    <FilePdfIcon size={14} />
  )
}

function renderPdfTemplateThumb(file: File, page: PdfPage): Promise<string> {
  return page.kind === 'pdf'
    ? renderPageThumb(file, page.pageIndex, pageThumbKey(page))
    : Promise.reject(new Error('La página no es PDF'))
}
