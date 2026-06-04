import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  baselineDropEm,
  getSource,
  isTextAnnotation,
  makeHighlightAnnotation,
  makeTextAnnotation,
  pageThumbKey,
  previewFontFamily,
  TEXT_LINE_HEIGHT,
  type Annotation,
  type HighlightAnnotation,
  type PdfDoc,
  type PdfFontKind,
  type TextAnnotation,
} from '../../../lib/pdfStudio/model'
import { renderPageThumb } from '../../../lib/pdfStudio/pdfRender'
import { LoadingHint } from '../../LoadingHint'
import {
  BoldIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CursorIcon,
  DuplicateIcon,
  HighlighterIcon,
  OpacityIcon,
  PlusIcon,
  RotateIcon,
  TextSizeIcon,
  TrashIcon,
  ZoomIcon,
} from '../../Icons'

const ACCENT = 'var(--accent-primary)'

const FONTS: { key: PdfFontKind; label: string }[] = [
  { key: 'sans', label: 'Sans' },
  { key: 'serif', label: 'Serif' },
  { key: 'mono', label: 'Mono' },
]
const COLORS: { hex: string; label: string }[] = [
  { hex: '#222222', label: 'Tinta' },
  { hex: '#ffffff', label: 'Papel' },
  { hex: '#b3412c', label: 'Rojo' },
  { hex: '#2f5d8a', label: 'Azul' },
  { hex: '#4b7355', label: 'Verde' },
]

// Tamaño de letra (fracción del alto de página) y zoom: rangos + pasos.
const SIZE_MIN = 0.012
const SIZE_MAX = 0.14
const SIZE_STEP = 0.004
const ZOOM_MIN = 0.5
const ZOOM_MAX = 4
const ZOOM_STEP = 0.25

// Padding TRANSPARENTE alrededor del texto para agrandar el blanco clickeable (el
// bug "a veces no se selecciona"): el margen negativo lo compensa, así el texto NO
// se mueve respecto de la salida.
const HIT_X = 6
const HIT_Y = 4

// Opacidad por defecto del resaltado (translúcido, como un marcador).
const HIGHLIGHT_OPACITY = 0.35
// Herramientas del editor (modos). Crece con lápiz/formas/firma.
type Tool = 'select' | 'highlight'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** `#rrggbb` + alfa → `rgba(...)`, para pintar el relleno translúcido del
 *  resaltado sin atenuar el contorno de selección (que `opacity` sí atenuaría). */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1]!, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

const segGroup =
  'inline-flex shrink-0 items-center gap-0.5 p-0.5 bg-paper-100/60 rounded-md border border-ink-100/50'
const segBtn = (on: boolean) =>
  `px-2 py-0.5 rounded text-caption transition-colors ${
    on ? 'bg-paper-50 text-ink-800 shadow-sm' : 'text-ink-400 hover:text-ink-700'
  }`
const stepBtn =
  'h-6 w-6 inline-flex items-center justify-center rounded text-ink-500 hover:text-ink-800 hover:bg-paper-50 disabled:opacity-30 transition-colors'

/**
 * Control `−[valor]+` con un ÍCONO que lo identifica (tamaño, opacidad, rotación,
 * zoom) para que no se confundan entre sí. El valor puede ser un botón (p. ej. el
 * zoom, que al tocarlo se restablece).
 */
function Stepper({
  icon,
  label,
  value,
  onDec,
  onInc,
  onValueClick,
  decDisabled,
  incDisabled,
  valueClass = 'w-8',
}: {
  icon: ReactNode
  label: string
  value: string
  onDec: () => void
  onInc: () => void
  onValueClick?: () => void
  decDisabled?: boolean
  incDisabled?: boolean
  valueClass?: string
}) {
  return (
    <div className={segGroup} title={label}>
      <span className="pl-1 text-ink-400" aria-hidden>
        {icon}
      </span>
      <button
        type="button"
        onClick={onDec}
        disabled={decDisabled}
        aria-label={`${label}: reducir`}
        className={stepBtn}
      >
        −
      </button>
      {onValueClick ? (
        <button
          type="button"
          onClick={onValueClick}
          title="Restablecer"
          className={`${valueClass} text-center text-caption tabular-nums text-ink-600 hover:text-ink-800`}
        >
          {value}
        </button>
      ) : (
        <span
          className={`${valueClass} text-center text-caption tabular-nums text-ink-600`}
        >
          {value}
        </span>
      )}
      <button
        type="button"
        onClick={onInc}
        disabled={incDisabled}
        aria-label={`${label}: aumentar`}
        className={stepBtn}
      >
        +
      </button>
    </div>
  )
}

/**
 * Edición INLINE del texto SOBRE el cuadro (no en la barra). `contentEditable` NO
 * controlado: setea el contenido inicial por ref al montar y lo lee al confirmar,
 * así el cursor no salta. Enter/blur confirman; Escape cancela. Detiene la
 * propagación para no disparar los atajos globales (Supr/flechas) ni el drag.
 */
function EditableBox({
  initial,
  style,
  onCommit,
  onCancel,
}: {
  initial: string
  style: CSSProperties
  onCommit: (text: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.textContent = initial
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    // sólo al montar (es no controlado a propósito)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const commit = () => onCommit((ref.current?.textContent ?? '').replace(/\r?\n/g, ' '))
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Editar texto"
      spellCheck={false}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      style={{
        ...style,
        cursor: 'text',
        userSelect: 'text',
        outline: `1.5px solid ${ACCENT}`,
        outlineOffset: 0,
      }}
    />
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
  const total = doc.pages.length
  const [currentPage, setCurrentPage] = useState(pageIndex)
  // Anotaciones EDITADAS por página (las que no se tocan siguen las del doc). Así
  // se puede navegar y editar varias páginas y confirmar todo junto.
  const [edited, setEdited] = useState<Record<number, Annotation[]>>({})

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
  // Refs para que los efectos montados una vez vean el estado actual sin re-suscribir.
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedId
  const pageRef = useRef(currentPage)
  pageRef.current = currentPage

  /** Actualiza las anotaciones de la página VISIBLE (en el mapa de editadas).
   *  Estable: lee la página actual del ref, así sirve desde efectos viejos. */
  const setAnnotations = useCallback(
    (fn: (list: Annotation[]) => Annotation[]) => {
      const i = pageRef.current
      setEdited((e) => ({ ...e, [i]: fn(e[i] ?? doc.pages[i]?.annotations ?? []) }))
    },
    [doc],
  )

  // Fondo: render grande de la página (pdf.js) o la imagen directa. Re-corre al
  // navegar (cambia `page`); `bg` se pone null en `goToPage` para mostrar carga.
  useEffect(() => {
    if (!page || !source) return
    let alive = true
    let createdUrl: string | null = null
    const measure = (url: string) => {
      const im = new Image()
      im.onload = () => alive && setBg({ url, w: im.naturalWidth, h: im.naturalHeight })
      im.src = url
    }
    if (page.kind === 'image') {
      createdUrl = URL.createObjectURL(source.file)
      measure(createdUrl)
    } else {
      renderPageThumb(source.file, page.pageIndex, `${pageThumbKey(page)}:lg`, 1400)
        .then((url) => alive && measure(url))
        .catch(() => {})
    }
    return () => {
      alive = false
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [page, source])

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

  // Escape cancela el modal — salvo mientras se edita un texto inline (ahí Escape
  // lo maneja el propio cuadro para cancelar la edición).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if ((e.target as HTMLElement | null)?.isContentEditable) return
      onClose(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Atajos sobre el texto seleccionado (fuera de inputs): Supr borra, flechas
  // mueven fino.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      )
        return
      const id = selectedRef.current
      if (!id) return
      if (e.key === 'Delete') {
        e.preventDefault()
        setAnnotations((l) => l.filter((a) => a.id !== id))
        setSelectedId(null)
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const dx = e.key === 'ArrowLeft' ? -0.01 : e.key === 'ArrowRight' ? 0.01 : 0
        const dy = e.key === 'ArrowUp' ? -0.01 : e.key === 'ArrowDown' ? 0.01 : 0
        setAnnotations((l) =>
          l.map((a) =>
            a.id === id
              ? { ...a, xRatio: clamp01(a.xRatio + dx), yRatio: clamp01(a.yRatio + dy) }
              : a,
          ),
        )
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [setAnnotations])

  // Layout de la página en su orientación FINAL (rotada = como saldrá), ajustada al
  // área medida. Caja EXTERIOR = bounding box rotado; INTERIOR = nativa que se rota
  // dentro. Las anotaciones viven en la interior (ratios nativos) → rotan con ella.
  const layout = useMemo(() => {
    if (!bg || !area) return null
    const rot = page ? ((page.rotationQuarters % 4) + 4) % 4 : 0
    const swap = rot % 2 === 1
    const maxW = Math.max(80, area.w - 32)
    const maxH = Math.max(80, area.h - 32)
    const finalAspect = swap ? bg.w / bg.h : bg.h / bg.w
    let outerW = maxW
    let outerH = outerW * finalAspect
    if (outerH > maxH) {
      outerH = maxH
      outerW = outerH / finalAspect
    }
    const innerW = swap ? outerH : outerW
    const innerH = swap ? outerW : outerH
    return { rot, outerW, outerH, innerW, innerH }
  }, [bg, page, area])

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
  // define el estilo del PRÓXIMO texto/resaltado. Color/opacidad valen para texto y
  // resaltado; fuente/tamaño/negrita/rotación son sólo de texto.
  type TextStyle = Pick<
    TextAnnotation,
    'font' | 'sizeRatio' | 'bold' | 'color' | 'opacity' | 'rotation'
  >
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

  /** Ajusta tamaño/opacidad/rotación (texto seleccionado o estilo por defecto). */
  const stepSize = (delta: number) =>
    applyStyle({ sizeRatio: clamp(activeSize + delta, SIZE_MIN, SIZE_MAX) })
  const stepOpacity = (delta: number) =>
    applyStyle({ opacity: clamp(activeOpacity + delta, 0.1, 1) })
  const stepRotation = (delta: number) =>
    applyStyle({ rotation: (((activeRotation + delta) % 360) + 360) % 360 })

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
    const move = (ev: PointerEvent) => {
      // Delta de pantalla → frame nativo de la página (inversa de la rotación CSS).
      const sdx = ev.clientX - startX
      const sdy = ev.clientY - startY
      let pdx = sdx
      let pdy = sdy
      if (rot === 1) {
        pdx = sdy
        pdy = -sdx
      } else if (rot === 2) {
        pdx = -sdx
        pdy = -sdy
      } else if (rot === 3) {
        pdx = -sdy
        pdy = sdx
      }
      const xRatio = clamp01(ox + pdx / dw)
      const yRatio = clamp01(oy + pdy / dh)
      setAnnotations((list) =>
        list.map((x) => (x.id === a.id ? { ...x, xRatio, yRatio } : x)),
      )
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
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
      const sdx = ev.clientX - startX
      const sdy = ev.clientY - startY
      let pdx = sdx
      let pdy = sdy
      if (rot === 1) {
        pdx = sdy
        pdy = -sdx
      } else if (rot === 2) {
        pdx = -sdx
        pdy = -sdy
      } else if (rot === 3) {
        pdx = -sdy
        pdy = sdx
      }
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
      const w = Math.abs(last.x1 - last.x0)
      const h = Math.abs(last.y1 - last.y0)
      if (w < 4 || h < 4) return // clic suelto sin arrastrar → nada
      const hl = makeHighlightAnnotation({
        xRatio: Math.min(last.x0, last.x1) / innerW,
        yRatio: Math.min(last.y0, last.y1) / innerH,
        wRatio: w / innerW,
        hRatio: h / innerH,
        color: style.color,
        opacity: HIGHLIGHT_OPACITY,
      })
      setAnnotations((l) => [...l, hl])
      setSelectedId(hl.id)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Caja exterior (scroll) = bounding box FINAL (rotado) escalado por zoom.
  const zw = layout ? layout.outerW * zoom : 0
  const zh = layout ? layout.outerH * zoom : 0
  const zoomBtn = (delta: number) => () =>
    setZoom((z) => clamp(Math.round((z + delta) * 100) / 100, ZOOM_MIN, ZOOM_MAX))

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
      className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-ink-900/40 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl h-[95vh] overflow-hidden rounded-xl border border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/20 flex flex-col"
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
            <button onClick={() => onClose(null)} className="btn-ghost text-xs">
              Cancelar
            </button>
            <button onClick={() => onClose(edited)} className="btn-accent text-xs">
              Listo
            </button>
          </div>
        </header>

        {/* Barra de edición — UNA fila (scroll horizontal si no entra) para no
            robarle alto al documento. */}
        <div className="flex flex-nowrap items-center gap-x-2 overflow-x-auto px-3 py-1.5 border-b border-ink-100/70 shrink-0">
          {/* Modos de herramienta */}
          <div className={segGroup}>
            <button
              type="button"
              onClick={() => setTool('select')}
              className={segBtn(tool === 'select')}
              title="Seleccionar y mover"
              aria-label="Herramienta seleccionar"
              aria-pressed={tool === 'select'}
            >
              <CursorIcon size={14} />
            </button>
            <button
              type="button"
              onClick={() => setTool('highlight')}
              className={segBtn(tool === 'highlight')}
              title="Resaltar (arrastra sobre la página)"
              aria-label="Herramienta resaltar"
              aria-pressed={tool === 'highlight'}
            >
              <HighlighterIcon size={14} />
            </button>
          </div>

          <button
            onClick={addText}
            className="btn-ghost text-xs inline-flex shrink-0 items-center gap-1.5"
          >
            <PlusIcon size={13} /> Agregar texto
          </button>

          <span className="w-px h-5 bg-ink-100 mx-0.5 shrink-0" aria-hidden />

          {/* Herramientas de estilo — SIEMPRE activas */}
          <div className={segGroup}>
            {FONTS.map((f) => (
              <button
                key={f.key}
                onClick={() => applyStyle({ font: f.key })}
                className={segBtn(activeFont === f.key)}
                style={{ fontFamily: previewFontFamily(f.key) }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Stepper
            icon={<TextSizeIcon size={14} />}
            label="Tamaño de letra"
            value={String(Math.round(activeSize * 1000))}
            valueClass="w-7"
            onDec={() => stepSize(-SIZE_STEP)}
            onInc={() => stepSize(SIZE_STEP)}
            decDisabled={activeSize <= SIZE_MIN + 1e-6}
            incDisabled={activeSize >= SIZE_MAX - 1e-6}
          />
          <button
            onClick={() => applyStyle({ bold: !activeBold })}
            aria-pressed={activeBold}
            aria-label="Negrita"
            title="Negrita"
            className={`shrink-0 h-7 w-8 inline-flex items-center justify-center rounded-md border transition-colors ${
              activeBold
                ? 'border-ink-300 text-ink-800 bg-ink-100/60'
                : 'border-ink-100 text-ink-400 hover:text-ink-700 hover:border-ink-200'
            }`}
          >
            <BoldIcon size={14} />
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            {COLORS.map((c) => {
              const on = activeColor === c.hex
              return (
                <button
                  key={c.hex}
                  onClick={() => applyStyle({ color: c.hex })}
                  aria-label={`Color ${c.label}`}
                  aria-pressed={on}
                  title={c.label}
                  className="h-6 w-6 rounded-full border border-ink-900/15 transition-transform duration-150 hover:scale-110"
                  style={{
                    backgroundColor: c.hex,
                    transform: on ? 'scale(1.15)' : undefined,
                    boxShadow: on
                      ? `0 0 0 2px rgb(var(--paper-50)), 0 0 0 3.5px ${ACCENT}`
                      : undefined,
                  }}
                />
              )
            })}
          </div>
          <Stepper
            icon={<OpacityIcon size={14} />}
            label="Opacidad"
            value={`${Math.round(activeOpacity * 100)}%`}
            valueClass="w-9"
            onDec={() => stepOpacity(-0.1)}
            onInc={() => stepOpacity(0.1)}
            decDisabled={activeOpacity <= 0.1 + 1e-6}
            incDisabled={activeOpacity >= 1 - 1e-6}
          />
          <Stepper
            icon={<RotateIcon size={14} />}
            label="Rotación del texto"
            value={`${activeRotation}°`}
            valueClass="w-8"
            onDec={() => stepRotation(-15)}
            onInc={() => stepRotation(15)}
          />

          {/* Duplicar — sólo texto (contextual) */}
          {selected && (
            <button
              onClick={() => duplicate(selected)}
              aria-label="Duplicar texto"
              title="Duplicar texto"
              className="shrink-0 touch-target inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-400 hover:text-ink-800 hover:bg-ink-100/40 transition-colors"
            >
              <DuplicateIcon size={14} />
            </button>
          )}
          {/* Eliminar — cualquier anotación seleccionada */}
          {selectedAnn && (
            <button
              onClick={() => removeText(selectedAnn.id)}
              aria-label="Eliminar"
              title="Eliminar (Supr)"
              className="shrink-0 touch-target inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-300 hover:text-[color:var(--accent-clay)] hover:bg-ink-100/40 transition-colors"
            >
              <TrashIcon size={14} />
            </button>
          )}

          <div className="flex-1 min-w-[8px]" />

          {/* Zoom del documento — separado a la derecha */}
          <Stepper
            icon={<ZoomIcon size={14} />}
            label="Zoom del documento"
            value={`${Math.round(zoom * 100)}%`}
            valueClass="w-10"
            onValueClick={() => setZoom(1)}
            onDec={zoomBtn(-ZOOM_STEP)}
            onInc={zoomBtn(ZOOM_STEP)}
            decDisabled={zoom <= ZOOM_MIN}
            incDisabled={zoom >= ZOOM_MAX}
          />
        </div>

        {/* Página — ocupa el resto; centrada y scrolleable al hacer zoom */}
        <div
          ref={areaRef}
          className="flex-1 min-h-0 overflow-auto grid place-items-center bg-ink-100/30 p-3"
        >
          {layout && bg ? (
            <div className="relative" style={{ width: zw, height: zh }}>
              <div
                onPointerDown={tool === 'highlight' ? startHighlight : undefined}
                onClick={
                  tool === 'select'
                    ? () => {
                        setSelectedId(null)
                        setEditingId(null)
                      }
                    : undefined
                }
                className="absolute left-1/2 top-1/2 bg-white rounded-sm ring-1 ring-ink-900/10 shadow-xl shadow-ink-900/15"
                style={{
                  width: layout.innerW,
                  height: layout.innerH,
                  transform: `translate(-50%, -50%) rotate(${layout.rot * 90}deg) scale(${zoom})`,
                  cursor: tool === 'highlight' ? 'crosshair' : undefined,
                  touchAction: tool === 'highlight' ? 'none' : undefined,
                }}
              >
                <img
                  src={bg.url}
                  alt={`Página ${currentPage + 1}`}
                  className="absolute inset-0 w-full h-full object-contain select-none"
                  draggable={false}
                />
                {annotations.filter(isTextAnnotation).map((a) => {
                  const sz = a.sizeRatio * layout.innerH
                  // Estilo compartido por el cuadro display y el editable. El padding
                  // transparente (compensado por el margen negativo) agranda el blanco
                  // clickeable SIN mover el texto; el pivote de rotación queda en la
                  // baseline-izquierda real del texto.
                  const boxStyle: CSSProperties = {
                    position: 'absolute',
                    left: `${a.xRatio * 100}%`,
                    top: `${a.yRatio * 100}%`,
                    margin: `-${HIT_Y}px -${HIT_X}px`,
                    padding: `${HIT_Y}px ${HIT_X}px`,
                    fontFamily: previewFontFamily(a.font),
                    fontWeight: a.bold ? 700 : 400,
                    fontSize: `${sz}px`,
                    lineHeight: TEXT_LINE_HEIGHT,
                    color: a.color,
                    opacity: a.opacity ?? 1,
                    transform: a.rotation ? `rotate(${a.rotation}deg)` : undefined,
                    transformOrigin: `${HIT_X}px ${HIT_Y + sz * baselineDropEm(a.font)}px`,
                    whiteSpace: 'pre',
                    borderRadius: 3,
                  }
                  if (editingId === a.id) {
                    return (
                      <EditableBox
                        key={a.id}
                        initial={a.text}
                        style={boxStyle}
                        onCommit={(text) => {
                          update(a.id, { text })
                          setEditingId(null)
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    )
                  }
                  return (
                    <div
                      key={a.id}
                      onPointerDown={(e) => startDrag(e, a)}
                      // Click selecciona ESTE (no llega al fondo, que deselecciona).
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedId(a.id)
                      }}
                      // Doble clic edita el texto INLINE, sobre el cuadro.
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setSelectedId(a.id)
                        setEditingId(a.id)
                      }}
                      title="Doble clic para editar · arrastra para mover"
                      style={{
                        ...boxStyle,
                        cursor: 'move',
                        userSelect: 'none',
                        touchAction: 'none',
                        // Fuera de "seleccionar" no captura (deja dibujar encima).
                        pointerEvents: tool === 'select' ? undefined : 'none',
                        outline:
                          selectedId === a.id
                            ? `1.5px solid ${ACCENT}`
                            : '1.5px solid transparent',
                        outlineOffset: 0,
                        transition: 'outline-color 120ms ease',
                      }}
                    >
                      {a.text || ' '}
                    </div>
                  )
                })}

                {/* Resaltados (rectángulos translúcidos) */}
                {annotations
                  .filter((a) => a.kind === 'highlight')
                  .map((a) => (
                    <div
                      key={a.id}
                      onPointerDown={
                        tool === 'select' ? (e) => startDrag(e, a) : undefined
                      }
                      onClick={
                        tool === 'select'
                          ? (e) => {
                              e.stopPropagation()
                              setSelectedId(a.id)
                            }
                          : undefined
                      }
                      title="Arrastra para mover"
                      style={{
                        position: 'absolute',
                        left: `${a.xRatio * 100}%`,
                        top: `${a.yRatio * 100}%`,
                        width: `${a.wRatio * 100}%`,
                        height: `${a.hRatio * 100}%`,
                        backgroundColor: hexToRgba(
                          a.color,
                          a.opacity ?? HIGHLIGHT_OPACITY,
                        ),
                        borderRadius: 2,
                        cursor: 'move',
                        touchAction: 'none',
                        pointerEvents: tool === 'select' ? undefined : 'none',
                        outline: selectedId === a.id ? `1.5px solid ${ACCENT}` : 'none',
                        outlineOffset: 1,
                      }}
                    />
                  ))}

                {/* Preview en vivo del resaltado que se está dibujando */}
                {drawing && (
                  <div
                    style={{
                      position: 'absolute',
                      left: Math.min(drawing.x0, drawing.x1),
                      top: Math.min(drawing.y0, drawing.y1),
                      width: Math.abs(drawing.x1 - drawing.x0),
                      height: Math.abs(drawing.y1 - drawing.y0),
                      backgroundColor: hexToRgba(style.color, HIGHLIGHT_OPACITY),
                      border: `1px dashed ${ACCENT}`,
                      borderRadius: 2,
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </div>
            </div>
          ) : (
            <LoadingHint text="cargando página" size="sm" />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
