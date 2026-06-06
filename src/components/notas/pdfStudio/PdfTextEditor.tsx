import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  cloneAnnotation,
  getSource,
  makeImageAnnotation,
  makeTextAnnotation,
  pageThumbKey,
  translateAnnotation,
  type Annotation,
  type HighlightAnnotation,
  type ImageAnnotation,
  type PdfDoc,
  type ShapeAnnotation,
  type TextAnnotation,
} from '../../../lib/pdfStudio/model'
import {
  fitPageLayout,
  fitImageStampBox,
  screenDeltaToPage,
  type ResizeHandle,
} from '../../../lib/pdfStudio/editorGeometry'
import {
  canRedo,
  canUndo,
  initHistory,
  pushHistory,
  redo,
  undo,
  type History,
} from '../../../lib/pdfStudio/history'
import { pdfCommandTooltip } from '../../../lib/pdfStudio/commands'
import { renderPageBitmap } from '../../../lib/pdfStudio/pdfRender'
import { ChevronLeftIcon, ChevronRightIcon, RedoIcon, UndoIcon } from '../../Icons'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import { AnnotationLayer } from './AnnotationLayer'
import { EditorToolbar } from './EditorToolbar'
import { PageCanvas } from './PageCanvas'
import { createAnnotationFromDrawGesture } from './pdfAnnotationDrawing'
import { resizeAnnotationFromPointerDelta } from './pdfAnnotationResize'
import { reduceAnnotationShortcut } from './pdfAnnotationShortcuts'
import {
  applyEditorStylePatch,
  defaultEditorTextStyle,
  resolveActiveEditorStyle,
} from './pdfEditorStyleState'
import {
  HIGHLIGHT_OPACITY,
  SHAPE_STROKE,
  clamp,
  stepBtn,
  type TextStyle,
  type Tool,
} from './editorStyle'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const TEXT_SIZE_MIN = 0.012
const TEXT_SIZE_MAX = 0.14
const STAMP_ACCEPT = 'image/png,image/jpeg'

function isMacLike(): boolean {
  if (typeof navigator === 'undefined') return true
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

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

/**
 * Editor / visor de páginas del PDF: muestra la página grande con la barra de
 * edición ARRIBA y permite **navegar entre todas las páginas** del documento sin
 * cerrar. Deja agregar/mover/ajustar cajas de texto vectorial (WYSIWYG, posición y
 * tamaño como ratios). Al confirmar entrega las anotaciones EDITADAS por página; el
 * ensamblado las dibuja con `drawText` (texto seleccionable, la página NO se
 * rasteriza). Browser-only.
 */
export function PdfTextEditor({
  doc,
  pageIndex,
  onClose,
}: {
  doc: PdfDoc
  pageIndex: number
  onClose: (edits: Record<number, Annotation[]> | null) => void
}) {
  const isMac = isMacLike()
  const total = doc.pages.length
  const [currentPage, setCurrentPage] = useState(pageIndex)
  // Anotaciones EDITADAS por página (las no tocadas siguen las del doc), con
  // HISTORIAL propio → undo/redo DENTRO del modal. `edited` = presente.
  const [history, setHistory] = useState<History<Record<number, Annotation[]>>>(() =>
    initHistory({}),
  )
  const edited = history.present
  const editedRef = useRef(edited)
  editedRef.current = edited

  const page = doc.pages[currentPage]
  const source = page ? getSource(doc, page.sourceId) : undefined
  const annotations = edited[currentPage] ?? page?.annotations ?? []

  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Texto en edición INLINE (sobre el cuadro). null = ninguno.
  const [editingId, setEditingId] = useState<string | null>(null)
  // Herramienta activa y el rectángulo que se está dibujando (resaltador), en px
  // LOCALES de la página interior (para el preview en vivo).
  const [tool, setTool] = useState<Tool>('select')
  const [drawing, setDrawing] = useState<{
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)
  const [bg, setBg] = useState<{ url: string; w: number; h: number } | null>(null)
  // Default 150%: prioriza ver/editar la página en grande (la barra es compacta).
  const [zoom, setZoom] = useState(1.5)
  const [area, setArea] = useState<{ w: number; h: number } | null>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const stampInputRef = useRef<HTMLInputElement>(null)
  // Atrapa el foco dentro del modal (Tab no se escapa) y lo restaura al cerrar.
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, true)
  // Enfoca el CONTENEDOR (tabindex -1) al abrir, no un botón → así no aparece el
  // anillo azul de `:focus-visible` (externo, con offset) sobre un control al abrir.
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])
  // Refs para que los efectos montados una vez vean el estado actual sin re-suscribir.
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedId
  const editingRef = useRef<string | null>(null)
  editingRef.current = editingId
  const pageRef = useRef(currentPage)
  pageRef.current = currentPage
  // Lista de anotaciones de la página actual (para que el teclado copie/corte la
  // anotación seleccionada) y portapapeles interno (copia entre páginas).
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations
  const annClipboardRef = useRef<Annotation | null>(null)

  // Layout de la página en su orientación FINAL (rotada = como saldrá), ajustada al
  // área medida. Caja EXTERIOR = bounding box rotado; INTERIOR = nativa que se rota
  // dentro. Las anotaciones viven en la interior (ratios nativos) → rotan con ella.
  const layout = useMemo(
    () =>
      bg && area
        ? fitPageLayout(bg.w, bg.h, area.w, area.h, page?.rotationQuarters ?? 0)
        : null,
    [bg, page, area],
  )

  // Ancho objetivo del bitmap del fondo = px REALES de pantalla (ancho mostrado ·
  // zoom · DPR), redondeado a pasos de 256 px para no re-rendear por cada píxel. Es
  // lo que mantiene la página NÍTIDA al hacer zoom (en vez de estirar un raster
  // chico). `max(1, zoom)` → nunca por debajo del tamaño de ajuste.
  const renderWidth = useMemo(() => {
    const dpr = window.devicePixelRatio || 1
    const fitW = layout?.innerW ?? (area ? Math.max(80, area.w - 32) : 800)
    return Math.ceil((fitW * Math.max(1, zoom) * dpr) / 256) * 256
  }, [layout, area, zoom])

  // Qué página/ancho está renderizado como fondo (para SÓLO subir de resolución al
  // hacer zoom) + el object URL a revocar (lo posee el editor, no el cache).
  const renderedRef = useRef<{ key: string; width: number; url: string } | null>(null)
  useEffect(
    () => () => {
      if (renderedRef.current) URL.revokeObjectURL(renderedRef.current.url)
    },
    [],
  )

  /** Edición DISCRETA (agregar/borrar/estilo/flechas/…): empuja una entrada de
   *  historial. Estable (lee la página actual del ref → sirve desde efectos viejos). */
  const setAnnotations = useCallback(
    (fn: (list: Annotation[]) => Annotation[]) => {
      const i = pageRef.current
      setHistory((h) =>
        pushHistory(h, {
          ...h.present,
          [i]: fn(h.present[i] ?? doc.pages[i]?.annotations ?? []),
        }),
      )
    },
    [doc],
  )

  /** Edición EN VIVO (durante un arrastre): reemplaza el presente SIN crear una
   *  entrada de historial (el arrastre entero = un solo undo, ver `startDrag`). */
  const editLive = useCallback(
    (fn: (list: Annotation[]) => Annotation[]) => {
      const i = pageRef.current
      setHistory((h) => ({
        ...h,
        present: {
          ...h.present,
          [i]: fn(h.present[i] ?? doc.pages[i]?.annotations ?? []),
        },
      }))
    },
    [doc],
  )

  // Fondo IMAGEN: la imagen entera ES la página → object URL directo (full-res, sin
  // rasterizar). Re-corre al navegar; se revoca al salir.
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

  // Fondo PDF: render NÍTIDO con pdf.js al ancho que pide el zoom (`renderWidth`).
  // Navegar (cambia la página) renderiza ya y muestra "cargando" (`goToPage` puso
  // `bg=null`); subir el zoom re-renderiza más grande con un pequeño debounce y SIN
  // parpadeo (el bitmap viejo se mantiene hasta que carga el nuevo, y se revoca
  // 500 ms después). Bajar el zoom NO re-renderiza (se reusa el bitmap más grande).
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

  // Mide el área disponible para la página (para que ocupe todo el espacio).
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const read = () => setArea({ w: el.clientWidth, h: el.clientHeight })
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Escape en DOS etapas: si hay una anotación en edición inline o seleccionada,
  // primero deselecciona; sólo con nada seleccionado cierra el modal (evita perder
  // el trabajo por un Escape de más). En edición inline el propio cuadro maneja
  // Escape para cancelar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if ((e.target as HTMLElement | null)?.isContentEditable) return
      if (editingRef.current) {
        e.preventDefault()
        setEditingId(null)
        return
      }
      if (selectedRef.current) {
        e.preventDefault()
        setSelectedId(null)
        return
      }
      onClose(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Undo/redo DENTRO del modal (⌘Z / ⌘⇧Z) sobre el historial de anotaciones —
  // salvo en inputs / contentEditable (ahí ⌘Z es el undo nativo del texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const el = e.target as HTMLElement | null
      if (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      )
        return
      e.preventDefault()
      setSelectedId(null)
      setEditingId(null)
      setHistory((h) => (e.shiftKey ? redo(h) : undo(h)))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Atajos del editor (fuera de inputs / edición inline): copiar/cortar/pegar/
  // duplicar la anotación seleccionada (⌘C/⌘X/⌘V/⌘D, incluso entre páginas vía un
  // portapapeles interno), eliminar (Supr/Retroceso) y mover fino con las flechas
  // (Shift = paso grande).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      )
        return

      const currentAnnotations = annotationsRef.current
      const result = reduceAnnotationShortcut({
        annotations: currentAnnotations,
        selectedId: selectedRef.current,
        clipboard: annClipboardRef.current,
        key: e.key,
        mod: e.metaKey || e.ctrlKey,
        shift: e.shiftKey,
      })
      if (!result.handled) return

      e.preventDefault()
      annClipboardRef.current = result.clipboard
      if (result.selectedId !== selectedRef.current) setSelectedId(result.selectedId)
      if (result.annotations !== currentAnnotations) {
        setAnnotations(() => result.annotations)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [setAnnotations])

  // Sólo el TEXTO es editable por la barra (los otros tipos llegan en fases
  // siguientes). `selected` se estrecha a TextAnnotation.
  // La anotación seleccionada de CUALQUIER tipo (para color/opacidad/borrar) y, si
  // es texto, estrechada (para los controles de sólo-texto y la edición inline).
  const selectedAnn = annotations.find((a) => a.id === selectedId) ?? null
  const selected = selectedAnn?.kind === 'text' ? selectedAnn : null

  const update = (id: string, patch: Partial<Omit<TextAnnotation, 'id' | 'kind'>>) =>
    setAnnotations((list) =>
      list.map((a) => (a.id === id && a.kind === 'text' ? { ...a, ...patch } : a)),
    )

  // Estilo "activo" de la barra: edita la anotación seleccionada o, si no hay,
  // define el estilo del PRÓXIMO texto/resaltado (ver `TextStyle` en editorStyle).
  const [style, setStyle] = useState<TextStyle>({
    ...defaultEditorTextStyle(),
  })
  const activeStyle = resolveActiveEditorStyle(selectedAnn, style)
  const activeFont = activeStyle.font
  const activeSize = activeStyle.sizeRatio
  const activeBold = activeStyle.bold
  const activeColor = activeStyle.color
  const activeOpacity = activeStyle.opacity ?? 1
  const activeRotation = activeStyle.rotation ?? 0

  /** Aplica un cambio de estilo: lo recuerda como default y lo aplica a la selección
   *  (texto → todo; resaltado/forma → sólo color/opacidad). */
  const applyStyle = (patch: Partial<TextStyle>) => {
    setStyle((s) => ({ ...s, ...patch }))
    if (!selectedId) return
    setAnnotations((list) => applyEditorStylePatch(list, selectedId, patch))
  }

  function addText() {
    const a = makeTextAnnotation({
      text: 'Texto',
      xRatio: 0.2,
      yRatio: 0.42,
      sizeRatio: style.sizeRatio,
      color: style.color,
      font: style.font,
      bold: style.bold,
      opacity: style.opacity,
      rotation: style.rotation,
    })
    setTool('select')
    setAnnotations((l) => [...l, a])
    setSelectedId(a.id)
    setEditingId(a.id) // se edita inline, sobre el cuadro, al toque
  }

  async function addImageStamp(file: File) {
    if (!isImageStampFile(file)) return
    const src = await fileToDataUrl(file)
    const size = await readImageSize(src)
    const box = fitImageStampBox({
      pageW: layout?.innerW ?? size.w,
      pageH: layout?.innerH ?? size.h,
      imageW: size.w,
      imageH: size.h,
    })
    const a = makeImageAnnotation({
      src,
      ...box,
      opacity: style.opacity,
    })
    setTool('select')
    setEditingId(null)
    setAnnotations((l) => [...l, a])
    setSelectedId(a.id)
  }

  /** Duplica un texto con un pequeño offset y lo selecciona. */
  function duplicate(a: TextAnnotation) {
    const { id: _id, kind: _kind, ...rest } = a
    const copy = makeTextAnnotation({
      ...rest,
      xRatio: clamp01(a.xRatio + 0.03),
      yRatio: clamp01(a.yRatio + 0.03),
    })
    setAnnotations((l) => [...l, copy])
    setSelectedId(copy.id)
  }

  function duplicateImage(a: ImageAnnotation) {
    const copy = translateAnnotation(cloneAnnotation(a), 0.03, 0.03)
    setAnnotations((l) => [...l, copy])
    setSelectedId(copy.id)
  }

  function removeAnnotation(id: string) {
    setAnnotations((l) => l.filter((a) => a.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function startDrag(e: React.PointerEvent, a: Annotation) {
    e.stopPropagation()
    setSelectedId(a.id)
    // px reales en pantalla del lado interior (incluye el zoom).
    const dw = (layout?.innerW ?? 1) * zoom
    const dh = (layout?.innerH ?? 1) * zoom
    const rot = layout?.rot ?? 0
    const startX = e.clientX
    const startY = e.clientY
    // Anotación al iniciar el arrastre: mover = trasladarla desde acá (vale para
    // texto/resaltado/forma vía `translateAnnotation`).
    const orig = a
    // Snapshot ANTES del arrastre: al soltar se empuja UNA entrada de historial
    // (no una por cada `pointermove`).
    const before = editedRef.current
    let moved = false
    const move = (ev: PointerEvent) => {
      const { dx: pdx, dy: pdy } = screenDeltaToPage(
        ev.clientX - startX,
        ev.clientY - startY,
        rot,
      )
      moved = true
      const next = translateAnnotation(orig, pdx / dw, pdy / dh)
      editLive((list) => list.map((x) => (x.id === a.id ? next : x)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      // Cierra el arrastre como UN paso de historial: el `before` va al pasado y
      // el presente (final) queda; un solo undo lo revierte entero.
      if (moved)
        setHistory((h) => ({ past: [...h.past, before], present: h.present, future: [] }))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function startResize(
    e: React.PointerEvent,
    a: TextAnnotation | HighlightAnnotation | ImageAnnotation | ShapeAnnotation,
    handle: ResizeHandle,
  ) {
    if (!layout) return
    e.stopPropagation()
    e.preventDefault()
    setSelectedId(a.id)
    const dw = layout.innerW * zoom
    const dh = layout.innerH * zoom
    const rot = layout.rot
    const startX = e.clientX
    const startY = e.clientY
    const before = editedRef.current
    let resized = false
    const move = (ev: PointerEvent) => {
      resized = true
      const next = resizeAnnotationFromPointerDelta(a, handle, {
        screenDx: ev.clientX - startX,
        screenDy: ev.clientY - startY,
        pageWidthPx: dw,
        pageHeightPx: dh,
        rotationQuarters: rot,
        minTextSizeRatio: TEXT_SIZE_MIN,
        maxTextSizeRatio: TEXT_SIZE_MAX,
        minBoxWidthRatio: 14 / dw,
        minBoxHeightRatio: 14 / dh,
        lockAspectRatio: a.kind === 'image' && ev.shiftKey,
      })
      editLive((list) => list.map((x) => (x.id === a.id ? next : x)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (resized)
        setHistory((h) => ({ past: [...h.past, before], present: h.present, future: [] }))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /**
   * Inicia el DIBUJO por arrastre (modo resaltar o una forma). El inicio en coords
   * LOCALES de la página interior (offsetX/Y pre-transform); el movimiento usa el
   * delta de pantalla transformado por rotación/zoom (igual que el drag). Al soltar
   * crea un resaltado (rectángulo) o una forma según la herramienta activa.
   */
  function startDraw(e: React.PointerEvent) {
    if (!layout) return
    e.stopPropagation()
    const drawTool = tool
    const x0 = e.nativeEvent.offsetX
    const y0 = e.nativeEvent.offsetY
    const startX = e.clientX
    const startY = e.clientY
    const rot = layout.rot
    const innerW = layout.innerW
    const innerH = layout.innerH
    let last = { x0, y0, x1: x0, y1: y0 }
    setDrawing(last)
    const move = (ev: PointerEvent) => {
      const { dx: pdx, dy: pdy } = screenDeltaToPage(
        ev.clientX - startX,
        ev.clientY - startY,
        rot,
      )
      last = {
        x0,
        y0,
        x1: clamp(x0 + pdx / zoom, 0, innerW),
        y1: clamp(y0 + pdy / zoom, 0, innerH),
      }
      setDrawing(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDrawing(null)
      const annotation = createAnnotationFromDrawGesture({
        tool: drawTool,
        x0: last.x0,
        y0: last.y0,
        x1: last.x1,
        y1: last.y1,
        pageWidthPx: innerW,
        pageHeightPx: innerH,
        style: {
          color: style.color,
          strokeRatio: SHAPE_STROKE,
          highlightOpacity: HIGHLIGHT_OPACITY,
        },
      })
      if (!annotation) return
      setAnnotations((l) => [...l, annotation])
      setSelectedId(annotation.id)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** Navega a otra página: deselecciona y muestra "cargando" mientras renderiza. */
  const goToPage = (i: number) => {
    if (i < 0 || i >= total || i === currentPage) return
    setSelectedId(null)
    setEditingId(null)
    setBg(null)
    setCurrentPage(i)
  }

  // Portal a <body>: el modal debe escapar de cualquier ancestro con overflow o
  // transform (el contenedor scrolleable del mundo Notas), que si no lo recorta.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Editar página ${currentPage + 1}`}
      onClick={() => onClose(null)}
      className="pdf-studio fixed inset-0 z-[60] flex items-stretch justify-center bg-ink-900/40 backdrop-blur-sm"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl h-full overflow-hidden border-x border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/20 flex flex-col focus:outline-none"
      >
        {/* Cabecera compacta (una línea): navegación de páginas + acciones */}
        <header className="flex items-center justify-between gap-3 border-b border-ink-100/70 bg-paper-50/95 px-3 py-2 shadow-sm shadow-ink-900/5 shrink-0">
          <div className="flex items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 0}
              aria-label="Página anterior"
              title="Página anterior"
              className={stepBtn}
            >
              <ChevronLeftIcon size={16} />
            </button>
            <p className="text-sm font-medium text-ink-700 tabular-nums whitespace-nowrap">
              Página {currentPage + 1}{' '}
              <span className="font-normal text-ink-400">de {total}</span>
            </p>
            <button
              type="button"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === total - 1}
              aria-label="Página siguiente"
              title="Página siguiente"
              className={stepBtn}
            >
              <ChevronRightIcon size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="inline-flex items-center rounded-md border border-ink-100 bg-paper-50 overflow-hidden divide-x divide-ink-100">
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null)
                  setEditingId(null)
                  setHistory(undo)
                }}
                disabled={!canUndo(history)}
                aria-label="Deshacer"
                title={pdfCommandTooltip('undo', isMac)}
                className={stepBtn}
              >
                <UndoIcon size={15} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null)
                  setEditingId(null)
                  setHistory(redo)
                }}
                disabled={!canRedo(history)}
                aria-label="Rehacer"
                title={pdfCommandTooltip('redo', isMac)}
                className={stepBtn}
              >
                <RedoIcon size={15} />
              </button>
            </div>
            <button onClick={() => onClose(null)} className="btn-ghost text-xs">
              Cancelar
            </button>
            <button onClick={() => onClose(edited)} className="btn-accent text-xs">
              Listo
            </button>
          </div>
        </header>

        <EditorToolbar
          tool={tool}
          onToolChange={setTool}
          onAddText={addText}
          onAddImage={() => stampInputRef.current?.click()}
          activeFont={activeFont}
          activeSize={activeSize}
          activeBold={activeBold}
          activeColor={activeColor}
          activeOpacity={activeOpacity}
          activeRotation={activeRotation}
          onApplyStyle={applyStyle}
          hasDuplicableSelection={!!selected || selectedAnn?.kind === 'image'}
          duplicateLabel={
            selectedAnn?.kind === 'image' ? 'Duplicar imagen' : 'Duplicar texto'
          }
          onDuplicate={() => {
            if (selected) duplicate(selected)
            else if (selectedAnn?.kind === 'image') duplicateImage(selectedAnn)
          }}
          hasSelection={!!selectedAnn}
          onDelete={() => selectedAnn && removeAnnotation(selectedAnn.id)}
          zoom={zoom}
          onZoomChange={setZoom}
        />
        <input
          ref={stampInputRef}
          type="file"
          accept={STAMP_ACCEPT}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0]
            e.currentTarget.value = ''
            if (file) void addImageStamp(file)
          }}
        />

        {/* Página — ocupa el resto; centrada y scrolleable al hacer zoom */}
        <PageCanvas
          areaRef={areaRef}
          layout={layout}
          bg={bg}
          zoom={zoom}
          tool={tool}
          currentPage={currentPage}
          onStartDraw={startDraw}
          onBackgroundClick={() => {
            setSelectedId(null)
            setEditingId(null)
          }}
        >
          <AnnotationLayer
            annotations={annotations}
            innerW={layout?.innerW ?? 0}
            innerH={layout?.innerH ?? 0}
            tool={tool}
            selectedId={selectedId}
            editingId={editingId}
            drawing={drawing}
            drawColor={style.color}
            onStartDrag={startDrag}
            onSelect={setSelectedId}
            onStartEdit={(id) => {
              setSelectedId(id)
              setEditingId(id)
            }}
            onCommitText={(id, text) => {
              update(id, { text })
              setEditingId(null)
            }}
            onCancelEdit={() => setEditingId(null)}
            onStartResize={startResize}
          />
        </PageCanvas>
      </div>
    </div>,
    document.body,
  )
}
