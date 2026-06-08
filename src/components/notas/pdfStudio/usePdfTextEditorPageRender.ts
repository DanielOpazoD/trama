import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  fitPageLayout,
  type PageLayout,
} from '../../../lib/pdfStudio/model/editorGeometry'
import type { PdfPage, PdfSource } from '../../../lib/pdfStudio/model/model'
import { pageThumbKey } from '../../../lib/pdfStudio/model/model'
import { renderPageBitmap } from '../../../lib/pdfStudio/render/pdfRender'
import { readPdfTextEditorPageArea } from './pdfEditorPageArea'

export type PdfTextEditorBackground = { url: string; w: number; h: number }

export function usePdfTextEditorPageRender({
  page,
  source,
  zoom,
}: {
  page: PdfPage | undefined
  source: PdfSource | undefined
  zoom: number
}): {
  areaRef: RefObject<HTMLDivElement>
  bg: PdfTextEditorBackground | null
  layout: PageLayout | null
  resetBackground: () => void
} {
  const [bg, setBg] = useState<PdfTextEditorBackground | null>(null)
  const [area, setArea] = useState<{ w: number; h: number } | null>(null)
  const areaRef = useRef<HTMLDivElement>(null)

  const layout = useMemo(
    () =>
      bg && area
        ? fitPageLayout(bg.w, bg.h, area.w, area.h, page?.rotationQuarters ?? 0)
        : null,
    [bg, page, area],
  )

  const renderWidth = useMemo(() => {
    const dpr = window.devicePixelRatio || 1
    const fitW = layout?.innerW ?? (area ? Math.max(80, area.w - 32) : 800)
    return Math.ceil((fitW * Math.max(1, zoom) * dpr) / 256) * 256
  }, [layout, area, zoom])

  const renderedRef = useRef<{ key: string; width: number; url: string } | null>(null)
  useEffect(
    () => () => {
      if (renderedRef.current) URL.revokeObjectURL(renderedRef.current.url)
    },
    [],
  )

  useEffect(() => {
    if (!page || !source || page.kind !== 'image') return
    let alive = true
    const url = URL.createObjectURL(source.file)
    const im = new Image()
    im.onload = () => alive && setBg({ url, w: im.naturalWidth, h: im.naturalHeight })
    im.src = url
    return () => {
      alive = false
      URL.revokeObjectURL(url)
    }
  }, [page, source])

  useEffect(() => {
    if (!page || !source || page.kind !== 'pdf') return
    let alive = true
    const key = pageThumbKey(page)
    const samePage = renderedRef.current?.key === key
    if (samePage && renderedRef.current!.width >= renderWidth) return
    const run = () => {
      renderPageBitmap(source.file, page.pageIndex, renderWidth)
        .then(({ url, w, h }) => {
          if (!alive) {
            URL.revokeObjectURL(url)
            return
          }
          const prev = renderedRef.current
          renderedRef.current = { key, width: renderWidth, url }
          setBg({ url, w, h })
          if (prev) window.setTimeout(() => URL.revokeObjectURL(prev.url), 500)
        })
        .catch(() => {})
    }
    if (samePage) {
      const t = window.setTimeout(run, 200)
      return () => {
        alive = false
        window.clearTimeout(t)
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [page, source, renderWidth])

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const read = () => setArea(readPdfTextEditorPageArea(el))
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    const scrollContainer = el.closest<HTMLElement>('[data-pdf-editor-scroll]')
    if (scrollContainer) ro.observe(scrollContainer)
    return () => ro.disconnect()
  }, [])

  return {
    areaRef: areaRef as RefObject<HTMLDivElement>,
    bg,
    layout,
    resetBackground: () => setBg(null),
  }
}
