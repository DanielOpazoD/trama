import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useModalOverlay } from '../../hooks/useModalOverlay'
import type {
  EditImageOptions,
  EditorModel,
  TextLayer,
} from '../../lib/imageEditor/types'
import { defaultModel, rotatedDimensions } from '../../lib/imageEditor/transforms'
import { rasterize } from '../../lib/imageEditor/raster'
import { CropIcon, RotateIcon, TextIcon } from '../Icons'
import { CropOverlay } from './CropOverlay'
import { TextLayerView } from './TextLayerView'
import { TextControls } from './TextControls'

let layerSeq = 0
const nextId = () => `t${++layerSeq}`

/**
 * Editor de imágenes simple (recortar · girar 90° · texto). Trabaja sobre un
 * `File` y resuelve con el `File` editado, el original (si no hubo cambios) o
 * null (cancelar). Se monta en un root desprendido (ver lib/imageEditor/mount).
 */
export function ImageEditorModal({
  file,
  options,
  onResolve,
}: {
  file: File
  options: EditImageOptions
  onResolve: (result: File | null) => void
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  // Modal accesible: focus trap + aria-modal + Escape + scroll-lock + restaurar
  // foco al cerrar. Escape descarta los cambios (resuelve con null), igual que
  // el botón "cancelar". El guard de stack de overlays del hook evita que un
  // modal de fondo (p. ej. editar momento) reciba también el Escape.
  // Los atajos propios del editor (flechas para mover/redimensionar el recorte,
  // ver CropOverlay) son onKeyDown locales: el hook solo cubre Escape y no los
  // toca.
  const overlay = useModalOverlay({ open: true, onClose: () => onResolve(null) })

  const [model, setModel] = useState<EditorModel>(defaultModel)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cropMode, setCropMode] = useState(false)
  const [applying, setApplying] = useState(false)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [availW, setAvailW] = useState(560)

  const previewUrl = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl])

  // Cargar la imagen para conocer sus dimensiones + tener un elemento que dibujar.
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setNat({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.src = previewUrl
  }, [previewUrl])

  // Ancho disponible para encajar la imagen.
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setAvailW(el.clientWidth || 560))
    ro.observe(el)
    setAvailW(el.clientWidth || 560)
    return () => ro.disconnect()
  }, [])

  // Tamaño de la caja de preview (aspecto post-rotación encajado en el área).
  const box = useMemo(() => {
    if (!nat) return { w: 0, h: 0 }
    const rot = rotatedDimensions(nat.w, nat.h, model.rotationQuarters)
    const maxW = Math.max(160, availW)
    const maxH = Math.min(
      typeof window !== 'undefined' ? window.innerHeight * 0.55 : 520,
      560,
    )
    const scale = Math.min(maxW / rot.width, maxH / rot.height)
    return { w: Math.round(rot.width * scale), h: Math.round(rot.height * scale) }
  }, [nat, model.rotationQuarters, availW])

  // Dibujar la imagen rotada en el canvas de preview.
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !box.w || !box.h) return
    canvas.width = box.w
    canvas.height = box.h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, box.w, box.h)
    const q = model.rotationQuarters
    ctx.save()
    if (q === 1) ctx.translate(box.w, 0)
    else if (q === 2) ctx.translate(box.w, box.h)
    else if (q === 3) ctx.translate(0, box.h)
    ctx.rotate((q * Math.PI) / 2)
    const dw = q % 2 === 1 ? box.h : box.w
    const dh = q % 2 === 1 ? box.w : box.h
    ctx.drawImage(img, 0, 0, dw, dh)
    ctx.restore()
  }, [box.w, box.h, model.rotationQuarters, nat])

  const selected = model.textLayers.find((l) => l.id === selectedId) ?? null

  function rotate() {
    // Al girar reseteamos el recorte (su significado cambia con la orientación).
    setModel((m) => ({
      ...m,
      rotationQuarters: ((m.rotationQuarters + 1) % 4) as 0 | 1 | 2 | 3,
      crop: { xN: 0, yN: 0, wN: 1, hN: 1 },
    }))
  }
  function addText() {
    const layer: TextLayer = {
      id: nextId(),
      text: 'Texto',
      xN: 0.12,
      yN: 0.12,
      font: 'sans',
      size: 'M',
      bold: false,
      color: 'paper',
    }
    setModel((m) => ({ ...m, textLayers: [...m.textLayers, layer] }))
    setSelectedId(layer.id)
    setCropMode(false)
  }
  function patchText(id: string, patch: Partial<TextLayer>) {
    setModel((m) => ({
      ...m,
      textLayers: m.textLayers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }))
  }
  function removeText(id: string) {
    setModel((m) => ({ ...m, textLayers: m.textLayers.filter((l) => l.id !== id) }))
    setSelectedId(null)
  }
  async function apply() {
    if (applying) return
    setApplying(true)
    const edited = await rasterize(file, model, options)
    onResolve(edited)
  }

  const toolBtn = (active: boolean) =>
    `touch-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-caption transition-colors ${
      active
        ? 'bg-ink-700 text-paper-50'
        : 'text-ink-500 hover:text-ink-800 hover:bg-ink-100 border border-ink-100'
    }`

  return (
    <>
      <button
        onClick={() => onResolve(null)}
        aria-label="Cerrar"
        className="fixed inset-0 z-[60] bg-ink-900/50 backdrop-blur-sm cursor-default animate-fade-up"
        tabIndex={-1}
      />
      <div className="fixed inset-0 z-[61] flex items-center justify-center px-4 py-6 pointer-events-none animate-fade-up">
        <div
          ref={overlay.dialogRef}
          role="dialog"
          aria-label="Editor de imágenes"
          aria-modal="true"
          className="pointer-events-auto w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-ink-100/80 rounded-xl shadow-xl shadow-ink-900/25"
          style={{ backgroundColor: 'rgb(var(--paper-50))' }}
        >
          <header className="px-5 py-3 border-b border-ink-100/60">
            {options.title && (
              <p className="section-eyebrow" style={{ color: 'var(--accent-gold)' }}>
                {options.title}
              </p>
            )}
            <h3 className="font-serif text-xl text-ink-800 leading-tight mt-0.5">
              Recortar y anotar
            </h3>
          </header>

          <div className="px-5 py-4 space-y-3">
            {/* Escenario con la imagen + overlays */}
            <div ref={stageRef} className="flex justify-center">
              {box.w > 0 ? (
                <div
                  className="relative"
                  style={{ width: box.w, height: box.h, touchAction: 'none' }}
                >
                  <canvas
                    ref={canvasRef}
                    className="block rounded-md border border-ink-100/70"
                    style={{ width: box.w, height: box.h }}
                  />
                  {model.textLayers.map((l) => (
                    <TextLayerView
                      key={l.id}
                      layer={l}
                      boxW={box.w}
                      boxH={box.h}
                      selected={l.id === selectedId}
                      onSelect={() => setSelectedId(l.id)}
                      onMove={(xN, yN) => patchText(l.id, { xN, yN })}
                    />
                  ))}
                  {cropMode && (
                    <CropOverlay
                      crop={model.crop}
                      boxW={box.w}
                      boxH={box.h}
                      onChange={(crop) => setModel((m) => ({ ...m, crop }))}
                    />
                  )}
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-ink-300 text-caption">
                  cargando imagen…
                </div>
              )}
            </div>

            {/* Herramientas */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCropMode((v) => !v)
                  setSelectedId(null)
                }}
                className={toolBtn(cropMode)}
                aria-pressed={cropMode}
              >
                <CropIcon size={12} /> Recortar
              </button>
              <button type="button" onClick={rotate} className={toolBtn(false)}>
                <RotateIcon size={12} /> Girar
              </button>
              <button type="button" onClick={addText} className={toolBtn(false)}>
                <TextIcon size={12} /> Texto
              </button>
            </div>

            {selected && (
              <TextControls
                layer={selected}
                onChange={(patch) => patchText(selected.id, patch)}
                onRemove={() => removeText(selected.id)}
              />
            )}
          </div>

          <div className="px-5 py-3 border-t border-ink-100/60 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => onResolve(null)}
              disabled={applying}
              className="section-eyebrow hover:text-ink-700 transition-colors disabled:opacity-60"
            >
              cancelar
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={applying || !nat}
              className="btn-accent text-xs"
            >
              {applying ? 'aplicando…' : 'listo'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
