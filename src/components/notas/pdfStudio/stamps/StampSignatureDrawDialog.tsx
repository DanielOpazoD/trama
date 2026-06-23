import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useModalOverlay } from '../../../../hooks/useModalOverlay'

export function StampSignatureDrawDialog({
  onCancel,
  onSave,
}: {
  onCancel: () => void
  onSave: (input: { name: string; src: string; width: number; height: number }) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)

  // Diálogo modal real: lo monta el padre mientras está abierto, así que
  // open=true mientras vive. El hook aporta focus-trap (Tab no escapa al PDF)
  // y Escape→cerrar, que antes faltaban. lockScroll=false porque el overlay
  // es absolute dentro del panel del estudio, no fixed sobre toda la página
  // (mismo criterio que ConfirmDestroy). El canvas y su captura de puntero
  // quedan intactos: el hook no toca eventos de puntero.
  const overlay = useModalOverlay({
    open: true,
    onClose: onCancel,
    lockScroll: false,
  })

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    }
  }

  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const p = point(event)
    if (!canvas || !p) return
    drawingRef.current = true
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#222222'
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    const p = point(event)
    if (!canvas || !p) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center bg-ink-900/20">
      <section
        ref={overlay.dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Dibujar firma"
        className="w-[min(92vw,420px)] rounded-md border border-ink-100 bg-paper-50 p-3 shadow-xl shadow-ink-900/20"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-caption font-semibold text-ink-800">Nueva firma</h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-2 py-1 text-caption text-ink-500 hover:bg-ink-100/60"
          >
            Cerrar
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={720}
          height={220}
          aria-label="Dibujar firma"
          className="h-32 w-full touch-none rounded border border-dashed border-[color:var(--accent-sage)]/60 bg-paper-100"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={() => {
            drawingRef.current = false
          }}
          onPointerCancel={() => {
            drawingRef.current = false
          }}
        />
        <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={clear}
            className="rounded-md px-2 py-1 text-caption text-ink-500 hover:bg-ink-100/60"
          >
            Limpiar trazo
          </button>
          <button
            type="button"
            onClick={() => {
              const canvas = canvasRef.current
              if (!canvas) return
              onSave({
                name: 'Firma',
                src: canvas.toDataURL('image/png'),
                width: canvas.width,
                height: canvas.height,
              })
            }}
            className="rounded-md bg-[color:var(--accent-sage)] px-2.5 py-1 text-caption font-semibold text-paper-50"
          >
            Guardar firma
          </button>
        </div>
      </section>
    </div>
  )
}
