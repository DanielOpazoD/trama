import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getSource,
  makeAnnotation,
  pageThumbKey,
  previewFontFamily,
  type PdfDoc,
  type PdfFontKind,
  type TextAnnotation,
} from '../../../lib/pdfStudio/model'
import { renderPageThumb } from '../../../lib/pdfStudio/pdfRender'
import { LoadingHint } from '../../LoadingHint'
import { BoldIcon, PlusIcon, TextIcon, TrashIcon } from '../../Icons'

const ACCENT = 'var(--accent-primary)'

const FONTS: { key: PdfFontKind; label: string }[] = [
  { key: 'sans', label: 'Sans' },
  { key: 'serif', label: 'Serif' },
  { key: 'mono', label: 'Mono' },
]
const SIZES: { key: string; ratio: number }[] = [
  { key: 'S', ratio: 0.028 },
  { key: 'M', ratio: 0.04 },
  { key: 'L', ratio: 0.058 },
]
const COLORS: { hex: string; label: string }[] = [
  { hex: '#222222', label: 'Tinta' },
  { hex: '#ffffff', label: 'Papel' },
  { hex: '#b3412c', label: 'Rojo' },
  { hex: '#2f5d8a', label: 'Azul' },
  { hex: '#4b7355', label: 'Verde' },
]

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

const segGroup =
  'inline-flex gap-0.5 p-0.5 bg-paper-100/60 rounded-md border border-ink-100/50'
const segBtn = (on: boolean) =>
  `px-2 py-0.5 rounded text-caption transition-colors ${
    on ? 'bg-paper-50 text-ink-800 shadow-sm' : 'text-ink-400 hover:text-ink-700'
  }`

/**
 * Editor de texto VECTORIAL sobre una página (PR D): muestra la página grande y
 * deja agregar cajas de texto, arrastrarlas y ajustar fuente/tamaño/negrita/color.
 * Es WYSIWYG —el preview usa la fuente web equivalente y guarda posición/tamaño
 * como ratios— y al confirmar entrega las anotaciones; el ensamblado las dibuja
 * con `drawText` (texto seleccionable, la página NO se rasteriza). Browser-only.
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
  const textRef = useRef<HTMLTextAreaElement>(null)
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
      renderPageThumb(source.file, page.pageIndex, `${pageThumbKey(page)}:lg`, 1100)
        .then((url) => alive && measure(url))
        .catch(() => {})
    }
    return () => {
      alive = false
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [page, source])

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

  // Layout de la página en su orientación FINAL (rotada = como saldrá). La caja
  // EXTERIOR es el bounding box rotado (lo que ocupa en pantalla); la página
  // INTERIOR es la nativa (sin rotar) que se rota dentro. Las anotaciones viven
  // en la página interior (ratios nativos) → rotan junto con ella, igual que en
  // el ensamblado (`setRotation`). Así el editor ≡ la salida.
  const layout = useMemo(() => {
    if (!bg) return null
    const rot = page ? ((page.rotationQuarters % 4) + 4) % 4 : 0
    const swap = rot % 2 === 1
    const maxW = Math.min(
      typeof window !== 'undefined' ? window.innerWidth * 0.92 : 760,
      760,
    )
    const maxH = (typeof window !== 'undefined' ? window.innerHeight : 800) * 0.62
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
  }, [bg, page])

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
    })
    setAnnotations((l) => [...l, a])
    setSelectedId(a.id)
    requestAnimationFrame(() => textRef.current?.select())
  }

  function removeText(id: string) {
    setAnnotations((l) => l.filter((a) => a.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function startDrag(e: React.PointerEvent, a: TextAnnotation) {
    e.stopPropagation()
    setSelectedId(a.id)
    const dw = layout?.innerW ?? 1
    const dh = layout?.innerH ?? 1
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Texto sobre la página ${pageIndex + 1}`}
      onClick={() => onClose(null)}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[92vh] overflow-auto rounded-xl border border-ink-100 bg-paper-50 shadow-xl shadow-ink-900/20 flex flex-col"
      >
        {/* Cabecera */}
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-ink-100/70">
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

        {/* Página + textos — en orientación FINAL (rotada como saldrá) */}
        <div className="flex-1 flex items-center justify-center bg-ink-100/30 p-5 sm:p-6">
          {layout && bg ? (
            <div
              className="relative"
              style={{ width: layout.outerW, height: layout.outerH }}
            >
              <div
                onClick={() => setSelectedId(null)}
                className="absolute left-1/2 top-1/2 bg-white rounded-sm ring-1 ring-ink-900/10 shadow-xl shadow-ink-900/15"
                style={{
                  width: layout.innerW,
                  height: layout.innerH,
                  transform: `translate(-50%, -50%) rotate(${layout.rot * 90}deg)`,
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
                    style={{
                      position: 'absolute',
                      left: `${a.xRatio * 100}%`,
                      top: `${a.yRatio * 100}%`,
                      fontFamily: previewFontFamily(a.font),
                      fontWeight: a.bold ? 700 : 400,
                      fontSize: `${a.sizeRatio * layout.innerH}px`,
                      lineHeight: 1.15,
                      color: a.color,
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
            <div className="py-24">
              <LoadingHint text="cargando página" size="sm" />
            </div>
          )}
        </div>

        {/* Controles */}
        <div className="border-t border-ink-100/70 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={addText}
              className="btn-ghost text-xs inline-flex items-center gap-1.5"
            >
              <PlusIcon size={13} /> Agregar texto
            </button>
            <span className="text-micro text-ink-300">
              {annotations.length === 0
                ? 'sin texto todavía'
                : `${annotations.length} ${annotations.length === 1 ? 'texto' : 'textos'} · arrastra para mover`}
            </span>
          </div>

          {selected ? (
            <div className="space-y-2.5 rounded-lg border border-ink-100/70 bg-paper-50 p-2.5">
              <textarea
                ref={textRef}
                value={selected.text}
                onChange={(e) => update(selected.id, { text: e.target.value })}
                rows={2}
                placeholder="Escribe el texto…"
                className="w-full bg-paper-100/40 rounded-md px-2.5 py-1.5 text-caption text-ink-700 placeholder:text-ink-300 resize-none border border-ink-100/60 transition-colors focus:border-ink-300 focus:bg-paper-50"
              />
              <div className="flex flex-wrap items-center gap-2">
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
                {/* Tamaño */}
                <div className={segGroup}>
                  {SIZES.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => update(selected.id, { sizeRatio: s.ratio })}
                      className={segBtn(Math.abs(selected.sizeRatio - s.ratio) < 0.005)}
                    >
                      {s.key}
                    </button>
                  ))}
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
                <div className="flex items-center gap-1.5 pl-0.5">
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
                {/* Borrar */}
                <button
                  onClick={() => removeText(selected.id)}
                  aria-label="Eliminar texto"
                  title="Eliminar texto (Supr)"
                  className="touch-target ml-auto inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-300 hover:text-[color:var(--accent-clay)] hover:bg-ink-100/40 transition-colors"
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-caption text-ink-400 text-center py-1.5">
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-ink-100/40 px-3 py-1"
                style={{ color: 'rgb(var(--ink-500))' }}
              >
                <TextIcon size={12} />
                Agrega un texto o toca uno para editarlo
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
