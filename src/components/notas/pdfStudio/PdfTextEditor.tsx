import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  cloneAnnotation,
  getSource,
  makeHighlightAnnotation,
  makeTextAnnotation,
  pageThumbKey,
  type Annotation,
  type HighlightAnnotation,
  type PdfDoc,
  type TextAnnotation,
} from '../../../lib/pdfStudio/model'
import {
  fitPageLayout,
  rectFromPoints,
  screenDeltaToPage,
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
import { renderPageBitmap } from '../../../lib/pdfStudio/pdfRender'
import { ChevronLeftIcon, ChevronRightIcon, RedoIcon, UndoIcon } from '../../Icons'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import { AnnotationLayer } from './AnnotationLayer'
import { EditorToolbar } from './EditorToolbar'
import { PageCanvas } from './PageCanvas'
import {
  HIGHLIGHT_OPACITY,
  clamp,
  stepBtn,
  type TextStyle,
  type Tool,
} from './editorStyle'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

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
    const pasteAnnotation = (src: Annotation) => {
      const fresh = cloneAnnotation(src)
      const placed: Annotation = {
        ...fresh,
        xRatio: clamp01(fresh.xRatio + 0.03),
        yRatio: clamp01(fresh.yRatio + 0.03),
      }
      setAnnotations((l) => [...l, placed])
      setSelectedId(placed.id)
    }
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      )
        return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      // Pegar NO requiere selección.
      if (mod && key === 'v') {
        if (!annClipboardRef.current) return
        e.preventDefault()
        pasteAnnotation(annClipboardRef.current)
        return
      }

      const id = selectedRef.current
      const current = id
        ? (annotationsRef.current.find((a) => a.id === id) ?? null)
        : null
      if (!current) return

      if (mod && key === 'c') {
        e.preventDefault()
        annClipboardRef.current = current
      } else if (mod && key === 'x') {
        e.preventDefault()
        annClipboardRef.current = current
        setAnnotations((l) => l.filter((a) => a.id !== current.id))
        setSelectedId(null)
      } else if (mod && key === 'd') {
        e.preventDefault()
        pasteAnnotation(current)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        setAnnotations((l) => l.filter((a) => a.id !== current.id))
        setSelectedId(null)
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 0.05 : 0.01
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        setAnnotations((l) =>
          l.map((a) =>
            a.id === current.id
              ? { ...a, xRatio: clamp01(a.xRatio + dx), yRatio: clamp01(a.yRatio + dy) }
              : a,
          ),
        )
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
    font: 'sans',
    sizeRatio: 0.04,
    bold: false,
    color: '#222222',
    opacity: 1,
    rotation: 0,
  })
  const activeFont = selected?.font ?? style.font
  const activeSize = selected?.sizeRatio ?? style.sizeRatio
  const activeBold = selected?.bold ?? style.bold
  const activeColor = selectedAnn?.color ?? style.color
  const activeOpacity = selectedAnn?.opacity ?? style.opacity ?? 1
  const activeRotation = selected?.rotation ?? style.rotation ?? 0

  /** Aplica un cambio de estilo: lo recuerda como default y lo aplica a la
   *  selección (texto → todo; resaltado → sólo color/opacidad). */
  const applyStyle = (patch: Partial<TextStyle>) => {
    setStyle((s) => ({ ...s, ...patch }))
    if (!selectedId) return
    setAnnotations((list) =>
      list.map((a) => {
        if (a.id !== selectedId) return a
        if (a.kind === 'text') return { ...a, ...patch }
        if (a.kind === 'highlight') {
          const hp: Partial<HighlightAnnotation> = {}
          if (patch.color !== undefined) hp.color = patch.color
          if (patch.opacity !== undefined) hp.opacity = patch.opacity
          return { ...a, ...hp }
        }
        return a
      }),
    )
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

  function removeText(id: string) {
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
    const ox = a.xRatio
    const oy = a.yRatio
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
      const xRatio = clamp01(ox + pdx / dw)
      const yRatio = clamp01(oy + pdy / dh)
      moved = true
      editLive((list) => list.map((x) => (x.id === a.id ? { ...x, xRatio, yRatio } : x)))
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

  /**
   * Inicia el dibujo de un RESALTADO (modo resaltar): rectángulo de arrastre. El
   * inicio en coords LOCALES de la página interior (offsetX/Y son pre-transform);
   * el movimiento usa el delta de pantalla transformado por la rotación / zoom
   * (igual que el drag). Al soltar crea la anotación si tiene tamaño.
   */
  function startHighlight(e: React.PointerEvent) {
    if (!layout) return
    e.stopPropagation()
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
      const r = rectFromPoints(last.x0, last.y0, last.x1, last.y1)
      if (r.w < 4 || r.h < 4) return // clic suelto sin arrastrar → nada
      const hl = makeHighlightAnnotation({
        xRatio: r.x / innerW,
        yRatio: r.y / innerH,
        wRatio: r.w / innerW,
        hRatio: r.h / innerH,
        color: style.color,
        opacity: HIGHLIGHT_OPACITY,
      })
      setAnnotations((l) => [...l, hl])
      setSelectedId(hl.id)
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
      aria-label={`Texto sobre la página ${currentPage + 1}`}
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
        <header className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-ink-100/70 shrink-0">
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
                title="Deshacer (⌘Z)"
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
                title="Rehacer (⌘⇧Z)"
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
          activeFont={activeFont}
          activeSize={activeSize}
          activeBold={activeBold}
          activeColor={activeColor}
          activeOpacity={activeOpacity}
          activeRotation={activeRotation}
          onApplyStyle={applyStyle}
          hasTextSelected={!!selected}
          onDuplicate={() => selected && duplicate(selected)}
          hasSelection={!!selectedAnn}
          onDelete={() => selectedAnn && removeText(selectedAnn.id)}
          zoom={zoom}
          onZoomChange={setZoom}
        />

        {/* Página — ocupa el resto; centrada y scrolleable al hacer zoom */}
        <PageCanvas
          areaRef={areaRef}
          layout={layout}
          bg={bg}
          zoom={zoom}
          tool={tool}
          currentPage={currentPage}
          onStartHighlight={startHighlight}
          onBackgroundClick={() => {
            setSelectedId(null)
            setEditingId(null)
          }}
        >
          <AnnotationLayer
            annotations={annotations}
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
          />
        </PageCanvas>
      </div>
    </div>,
    document.body,
  )
}
