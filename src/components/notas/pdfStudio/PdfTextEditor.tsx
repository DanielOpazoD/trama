import { useEffect, useMemo, useRef, useState } from 'react'
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
import { BoldIcon, DuplicateIcon, PlusIcon, TrashIcon } from '../../Icons'

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
  'inline-flex items-center gap-0.5 p-0.5 bg-paper-100/60 rounded-md border border-ink-100/50'
const segBtn = (on: boolean) =>
  `px-2 py-0.5 rounded text-caption transition-colors ${
    on ? 'bg-paper-50 text-ink-800 shadow-sm' : 'text-ink-400 hover:text-ink-700'
  }`
const stepBtn =
  'h-6 w-6 inline-flex items-center justify-center rounded text-ink-500 hover:text-ink-800 hover:bg-paper-50 disabled:opacity-30 transition-colors'

/**
 * Editor de texto VECTORIAL sobre una página (PR D): muestra la página grande con
 * la barra de edición ARRIBA (estilo herramienta pro), zoom, y deja agregar cajas
 * de texto, arrastrarlas y ajustar fuente/tamaño/negrita/color. Es WYSIWYG —el
 * preview usa la fuente web equivalente y guarda posición/tamaño como ratios— y al
 * confirmar entrega las anotaciones; el ensamblado las dibuja con `drawText`
 * (texto seleccionable, la página NO se rasteriza). Browser-only.
 */
export function PdfTextEditor({
  doc,
  pageIndex,
  onClose,
}: {
  doc: PdfDoc
  pageIndex: number
  onClose: (annotations: TextAnnotation[] | null) => void
}) {
  const page = doc.pages[pageIndex]
  const source = page ? getSource(doc, page.sourceId) : undefined

  const [annotations, setAnnotations] = useState<TextAnnotation[]>(
    () => page?.annotations ?? [],
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bg, setBg] = useState<{ url: string; w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<{ w: number; h: number } | null>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLInputElement>(null)
  // Ref al texto seleccionado, para los atajos de teclado sin re-suscribir.
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedId

  // Fondo: render grande de la página (pdf.js) o la imagen directa.
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
  // mueven fino. Lee de un ref para no re-suscribir en cada render.
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
  }, [])

  // Layout de la página en su orientación FINAL (rotada = como saldrá), ajustada
  // al área medida. La caja EXTERIOR es el bounding box rotado; la INTERIOR es la
  // nativa que se rota dentro. Las anotaciones viven en la interior (ratios
  // nativos) → rotan con ella, igual que `setRotation` en el ensamblado.
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

  function addText() {
    const a = makeAnnotation({
      text: 'Texto',
      xRatio: 0.2,
      yRatio: 0.42,
      sizeRatio: 0.04,
      color: '#222222',
      font: 'sans',
      bold: false,
      opacity: 1,
      rotation: 0,
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

  /** Ajusta opacidad/rotación del texto seleccionado. */
  const stepOpacity = (delta: number) => {
    if (selected) {
      update(selected.id, { opacity: clamp((selected.opacity ?? 1) + delta, 0.1, 1) })
    }
  }
  const stepRotation = (delta: number) => {
    if (selected) {
      update(selected.id, {
        rotation: ((((selected.rotation ?? 0) + delta) % 360) + 360) % 360,
      })
    }
  }

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

  // Caja exterior (scroll) = bounding box FINAL (rotado) escalado por zoom. La
  // página interior se escala con transform; el drag usa innerW/H × zoom aparte.
  const zw = layout ? layout.outerW * zoom : 0
  const zh = layout ? layout.outerH * zoom : 0
  const zoomBtn = (delta: number) => () =>
    setZoom((z) => clamp(Math.round((z + delta) * 100) / 100, ZOOM_MIN, ZOOM_MAX))
  const stepSize = (delta: number) => {
    if (selected) {
      update(selected.id, {
        sizeRatio: clamp(selected.sizeRatio + delta, SIZE_MIN, SIZE_MAX),
      })
    }
  }

  // Portal a <body>: el modal debe escapar de cualquier ancestro con overflow o
  // transform (el contenedor scrolleable del mundo Notas), que si no lo recorta.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Texto sobre la página ${pageIndex + 1}`}
      onClick={() => onClose(null)}
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-ink-900/40 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl h-[90vh] overflow-hidden rounded-xl border border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/20 flex flex-col"
      >
        {/* Cabecera */}
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-ink-100/70 shrink-0">
          <div className="min-w-0">
            <p className="section-eyebrow text-ink-400">texto sobre la página</p>
            <p className="text-sm font-medium text-ink-700 tabular-nums">
              Página {pageIndex + 1}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onClose(null)} className="btn-ghost text-xs">
              Cancelar
            </button>
            <button onClick={() => onClose(annotations)} className="btn-accent text-xs">
              Listo
            </button>
          </div>
        </header>

        {/* Barra de edición — ARRIBA del documento */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2 border-b border-ink-100/70 shrink-0">
          <button
            onClick={addText}
            className="btn-ghost text-xs inline-flex items-center gap-1.5"
          >
            <PlusIcon size={13} /> Agregar texto
          </button>

          {selected ? (
            <>
              <span className="w-px h-5 bg-ink-100 mx-0.5" aria-hidden />
              <input
                ref={textRef}
                value={selected.text}
                onChange={(e) => update(selected.id, { text: e.target.value })}
                placeholder="Escribe el texto…"
                className="w-36 sm:w-52 bg-paper-100/50 rounded-md px-2.5 py-1 text-caption text-ink-700 placeholder:text-ink-300 border border-ink-100/60 transition-colors focus:border-ink-300 focus:bg-paper-50"
              />
              {/* Fuente */}
              <div className={segGroup}>
                {FONTS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => update(selected.id, { font: f.key })}
                    className={segBtn(selected.font === f.key)}
                    style={{ fontFamily: previewFontFamily(f.key) }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {/* Tamaño de letra (configurable, granular) */}
              <div className={segGroup} title="Tamaño de letra">
                <button
                  onClick={() => stepSize(-SIZE_STEP)}
                  disabled={selected.sizeRatio <= SIZE_MIN + 1e-6}
                  aria-label="Reducir tamaño de letra"
                  className={stepBtn}
                >
                  −
                </button>
                <span className="w-7 text-center text-caption tabular-nums text-ink-600">
                  {Math.round(selected.sizeRatio * 1000)}
                </span>
                <button
                  onClick={() => stepSize(SIZE_STEP)}
                  disabled={selected.sizeRatio >= SIZE_MAX - 1e-6}
                  aria-label="Aumentar tamaño de letra"
                  className={stepBtn}
                >
                  +
                </button>
              </div>
              {/* Opacidad */}
              <div className={segGroup} title="Opacidad">
                <button
                  onClick={() => stepOpacity(-0.1)}
                  disabled={(selected.opacity ?? 1) <= 0.1 + 1e-6}
                  aria-label="Reducir opacidad"
                  className={stepBtn}
                >
                  −
                </button>
                <span className="w-10 text-center text-caption tabular-nums text-ink-600">
                  {Math.round((selected.opacity ?? 1) * 100)}%
                </span>
                <button
                  onClick={() => stepOpacity(0.1)}
                  disabled={(selected.opacity ?? 1) >= 1 - 1e-6}
                  aria-label="Aumentar opacidad"
                  className={stepBtn}
                >
                  +
                </button>
              </div>
              {/* Rotación del texto */}
              <div className={segGroup} title="Rotación del texto">
                <button
                  onClick={() => stepRotation(-15)}
                  aria-label="Rotar texto a la izquierda"
                  className={stepBtn}
                >
                  −
                </button>
                <span className="w-9 text-center text-caption tabular-nums text-ink-600">
                  {selected.rotation ?? 0}°
                </span>
                <button
                  onClick={() => stepRotation(15)}
                  aria-label="Rotar texto a la derecha"
                  className={stepBtn}
                >
                  +
                </button>
              </div>
              {/* Negrita */}
              <button
                onClick={() => update(selected.id, { bold: !selected.bold })}
                aria-pressed={selected.bold}
                aria-label="Negrita"
                title="Negrita"
                className={`h-7 w-8 inline-flex items-center justify-center rounded-md border transition-colors ${
                  selected.bold
                    ? 'border-ink-300 text-ink-800 bg-ink-100/60'
                    : 'border-ink-100 text-ink-400 hover:text-ink-700 hover:border-ink-200'
                }`}
              >
                <BoldIcon size={14} />
              </button>
              {/* Color */}
              <div className="flex items-center gap-1.5">
                {COLORS.map((c) => {
                  const on = selected.color === c.hex
                  return (
                    <button
                      key={c.hex}
                      onClick={() => update(selected.id, { color: c.hex })}
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
              {/* Duplicar */}
              <button
                onClick={() => duplicate(selected)}
                aria-label="Duplicar texto"
                title="Duplicar texto"
                className="touch-target inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-400 hover:text-ink-800 hover:bg-ink-100/40 transition-colors"
              >
                <DuplicateIcon size={14} />
              </button>
              {/* Borrar */}
              <button
                onClick={() => removeText(selected.id)}
                aria-label="Eliminar texto"
                title="Eliminar texto (Supr)"
                className="touch-target inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-300 hover:text-[color:var(--accent-clay)] hover:bg-ink-100/40 transition-colors"
              >
                <TrashIcon size={14} />
              </button>
            </>
          ) : (
            <span className="text-micro text-ink-300">
              Agrega un texto o toca uno para editarlo
            </span>
          )}

          <div className="flex-1" />

          {/* Zoom */}
          <div className={segGroup} title="Zoom">
            <button onClick={zoomBtn(-ZOOM_STEP)} aria-label="Alejar" className={stepBtn}>
              −
            </button>
            <button
              onClick={() => setZoom(1)}
              title="Restablecer zoom"
              className="w-12 text-center text-caption tabular-nums text-ink-600 hover:text-ink-800"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={zoomBtn(ZOOM_STEP)} aria-label="Acercar" className={stepBtn}>
              +
            </button>
          </div>
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
                  alt={`Página ${pageIndex + 1}`}
                  className="absolute inset-0 w-full h-full object-contain select-none"
                  draggable={false}
                />
                {annotations.map((a) => (
                  <div
                    key={a.id}
                    onPointerDown={(e) => startDrag(e, a)}
                    // El click NO debe llegar al fondo (que deselecciona): así
                    // tocar un texto existente lo re-selecciona y reabre la barra.
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
                      // Rota como pdf-lib: pivote en la baseline-izquierda, a la
                      // misma altura (baselineDropEm·tamaño) que usa el ensamblado.
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
