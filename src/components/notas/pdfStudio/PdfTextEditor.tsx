import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  baselineDropEm,
  getSource,
  makeAnnotation,
  pageThumbKey,
  previewFontFamily,
  TEXT_LINE_HEIGHT,
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
  DuplicateIcon,
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

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

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
  onClose: (edits: Record<number, TextAnnotation[]> | null) => void
}) {
  const total = doc.pages.length
  const [currentPage, setCurrentPage] = useState(pageIndex)
  // Anotaciones EDITADAS por página (las que no se tocan siguen las del doc). Así
  // se puede navegar y editar varias páginas y confirmar todo junto.
  const [edited, setEdited] = useState<Record<number, TextAnnotation[]>>({})

  const page = doc.pages[currentPage]
  const source = page ? getSource(doc, page.sourceId) : undefined
  const annotations = edited[currentPage] ?? page?.annotations ?? []

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bg, setBg] = useState<{ url: string; w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<{ w: number; h: number } | null>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLInputElement>(null)
  // Refs para que los efectos montados una vez vean el estado actual sin re-suscribir.
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedId
  const pageRef = useRef(currentPage)
  pageRef.current = currentPage

  /** Actualiza las anotaciones de la página VISIBLE (en el mapa de editadas).
   *  Estable: lee la página actual del ref, así sirve desde efectos viejos. */
  const setAnnotations = useCallback(
    (fn: (list: TextAnnotation[]) => TextAnnotation[]) => {
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

  // Escape cancela.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Atajos sobre el texto seleccionado (fuera de inputs): Supr borra, flechas
  // mueven fino.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
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

  const selected = annotations.find((a) => a.id === selectedId) ?? null

  const update = (id: string, patch: Partial<TextAnnotation>) =>
    setAnnotations((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)))

  // Estilo "activo" de la barra: si hay un texto seleccionado, las herramientas lo
  // editan; si no, definen el estilo del PRÓXIMO texto. Así la barra está SIEMPRE
  // activa y funcional.
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
  const activeColor = selected?.color ?? style.color
  const activeOpacity = selected?.opacity ?? style.opacity ?? 1
  const activeRotation = selected?.rotation ?? style.rotation ?? 0

  /** Aplica un cambio de estilo: al texto seleccionado (si hay) y lo recuerda como
   *  default para el próximo. */
  const applyStyle = (patch: Partial<TextStyle>) => {
    setStyle((s) => ({ ...s, ...patch }))
    if (selectedId) update(selectedId, patch)
  }

  function addText() {
    const a = makeAnnotation({
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
    setAnnotations((l) => [...l, a])
    setSelectedId(a.id)
    requestAnimationFrame(() => textRef.current?.select())
  }

  /** Duplica una anotación con un pequeño offset y la selecciona. */
  function duplicate(a: TextAnnotation) {
    const { id: _id, ...rest } = a
    const copy = makeAnnotation({
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

  function startDrag(e: React.PointerEvent, a: TextAnnotation) {
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
      update(a.id, {
        xRatio: clamp01(ox + pdx / dw),
        yRatio: clamp01(oy + pdy / dh),
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
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
        {/* Cabecera con navegación de páginas */}
        <header className="flex items-center justify-between gap-3 px-4 py-2 border-b border-ink-100/70 shrink-0">
          <div className="min-w-0">
            <p className="section-eyebrow text-ink-400">ver y editar</p>
            <div className="flex items-center gap-1">
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
        <div className="flex flex-nowrap items-center gap-x-2 overflow-x-auto px-4 py-2 border-b border-ink-100/70 shrink-0">
          <button
            onClick={addText}
            className="btn-ghost text-xs inline-flex shrink-0 items-center gap-1.5"
          >
            <PlusIcon size={13} /> Agregar texto
          </button>

          {/* Contenido del texto seleccionado (contextual) */}
          {selected && (
            <input
              ref={textRef}
              value={selected.text}
              onChange={(e) => update(selected.id, { text: e.target.value })}
              placeholder="Escribe el texto…"
              className="shrink-0 w-36 sm:w-48 bg-paper-100/50 rounded-md px-2.5 py-1 text-caption text-ink-700 placeholder:text-ink-300 border border-ink-100/60 transition-colors focus:border-ink-300 focus:bg-paper-50"
            />
          )}

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

          {/* Acciones sobre el texto seleccionado (contextual) */}
          {selected && (
            <>
              <button
                onClick={() => duplicate(selected)}
                aria-label="Duplicar texto"
                title="Duplicar texto"
                className="shrink-0 touch-target inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-400 hover:text-ink-800 hover:bg-ink-100/40 transition-colors"
              >
                <DuplicateIcon size={14} />
              </button>
              <button
                onClick={() => removeText(selected.id)}
                aria-label="Eliminar texto"
                title="Eliminar texto (Supr)"
                className="shrink-0 touch-target inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-300 hover:text-[color:var(--accent-clay)] hover:bg-ink-100/40 transition-colors"
              >
                <TrashIcon size={14} />
              </button>
            </>
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
          className="flex-1 min-h-0 overflow-auto grid place-items-center bg-ink-100/30 p-4"
        >
          {layout && bg ? (
            <div className="relative" style={{ width: zw, height: zh }}>
              <div
                onClick={() => setSelectedId(null)}
                className="absolute left-1/2 top-1/2 bg-white rounded-sm ring-1 ring-ink-900/10 shadow-xl shadow-ink-900/15"
                style={{
                  width: layout.innerW,
                  height: layout.innerH,
                  transform: `translate(-50%, -50%) rotate(${layout.rot * 90}deg) scale(${zoom})`,
                }}
              >
                <img
                  src={bg.url}
                  alt={`Página ${currentPage + 1}`}
                  className="absolute inset-0 w-full h-full object-contain select-none"
                  draggable={false}
                />
                {annotations.map((a) => (
                  <div
                    key={a.id}
                    onPointerDown={(e) => startDrag(e, a)}
                    // El click NO debe llegar al fondo (que deselecciona): así tocar
                    // un texto existente lo re-selecciona y reabre la barra.
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      left: `${a.xRatio * 100}%`,
                      top: `${a.yRatio * 100}%`,
                      fontFamily: previewFontFamily(a.font),
                      fontWeight: a.bold ? 700 : 400,
                      fontSize: `${a.sizeRatio * layout.innerH}px`,
                      lineHeight: TEXT_LINE_HEIGHT,
                      color: a.color,
                      opacity: a.opacity ?? 1,
                      transform: a.rotation ? `rotate(${a.rotation}deg)` : undefined,
                      transformOrigin: `0 ${a.sizeRatio * layout.innerH * baselineDropEm(a.font)}px`,
                      whiteSpace: 'pre',
                      cursor: 'move',
                      userSelect: 'none',
                      touchAction: 'none',
                      padding: '0 2px',
                      borderRadius: 2,
                      outline:
                        selectedId === a.id
                          ? `1.5px solid ${ACCENT}`
                          : '1.5px solid transparent',
                      outlineOffset: 2,
                      transition: 'outline-color 120ms ease',
                    }}
                  >
                    {a.text || ' '}
                  </div>
                ))}
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
