import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, SettingsIcon } from '../Icons'
import { IconButton } from '../IconButton'
import { Tooltip } from '../Tooltip'

/**
 * Chrome COMPARTIDO de las barras laterales (mundo Trama y mundo Notas):
 * ancho ajustable con el mouse, botón de colapso, buscador, y pie con
 * Configuración como ícono + la firma de versión. Una sola fuente de verdad
 * para que ambos mundos se sientan la misma aplicación.
 */

const WIDTH_KEY = 'trama:sidebar-width'
const SIDEBAR_DEFAULT_WIDTH = 256
const SIDEBAR_MIN_WIDTH = 208
const SIDEBAR_MAX_WIDTH = 384
const KEYBOARD_STEP = 16
const SNAP_RANGE = 8

function clampWidth(value: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)))
}

/** Imán sutil: cerca del ancho por defecto, el arrastre encaja en él. */
function snapWidth(value: number): number {
  const clamped = clampWidth(value)
  return Math.abs(clamped - SIDEBAR_DEFAULT_WIDTH) <= SNAP_RANGE
    ? SIDEBAR_DEFAULT_WIDTH
    : clamped
}

function readStoredWidth(): number {
  try {
    const raw = window.localStorage.getItem(WIDTH_KEY)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? clampWidth(parsed) : SIDEBAR_DEFAULT_WIDTH
  } catch {
    return SIDEBAR_DEFAULT_WIDTH
  }
}

function storeWidth(value: number) {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(value))
  } catch {
    // best-effort
  }
}

/** Ancho persistido de la barra + gestos para ajustarlo (arrastre, teclado,
 *  doble clic para volver al ancho por defecto). */
export function useSidebarWidth() {
  const [width, setWidth] = useState<number>(() =>
    typeof window === 'undefined' ? SIDEBAR_DEFAULT_WIDTH : readStoredWidth(),
  )
  const [resizing, setResizing] = useState(false)
  const frameRef = useRef(0)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Si el componente se desmonta a mitad de arrastre (cambio de mundo),
  // los listeners de window quedarían vivos — se limpian aquí.
  useEffect(() => () => cleanupRef.current?.(), [])

  // Durante el arrastre, el cursor col-resize y la no-selección aplican a
  // TODO el documento: sin esto el cursor parpadea al salirse del asa y el
  // movimiento rápido va seleccionando texto a su paso.
  useEffect(() => {
    if (!resizing) return
    const { cursor, userSelect } = document.body.style
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = cursor
      document.body.style.userSelect = userSelect
    }
  }, [resizing])

  const startResize = useCallback((event: React.PointerEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = readStoredWidth()
    cleanupRef.current?.()
    setResizing(true)
    const move = (ev: PointerEvent) => {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(() => {
        setWidth(snapWidth(startWidth + (ev.clientX - startX)))
      })
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      cancelAnimationFrame(frameRef.current)
      cleanupRef.current = null
    }
    const finish = (ev: PointerEvent) => {
      cleanup()
      const final = snapWidth(startWidth + (ev.clientX - startX))
      setWidth(final)
      storeWidth(final)
      setResizing(false)
    }
    const cancel = () => {
      // pointercancel no trae coordenadas útiles: se conserva el ancho vigente.
      cleanup()
      setWidth((current) => {
        storeWidth(current)
        return current
      })
      setResizing(false)
    }
    cleanupRef.current = cleanup
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
  }, [])

  const resetWidth = useCallback(() => {
    setWidth(SIDEBAR_DEFAULT_WIDTH)
    storeWidth(SIDEBAR_DEFAULT_WIDTH)
  }, [])

  const nudgeWidth = useCallback((event: KeyboardEvent) => {
    const delta =
      event.key === 'ArrowRight'
        ? KEYBOARD_STEP
        : event.key === 'ArrowLeft'
          ? -KEYBOARD_STEP
          : 0
    if (delta === 0) return
    event.preventDefault()
    setWidth((current) => {
      const next = clampWidth(current + delta)
      storeWidth(next)
      return next
    })
  }, [])

  return { width, resizing, startResize, resetWidth, nudgeWidth }
}

/** Asa de redimensión en el borde derecho: invisible hasta el hover/foco,
 *  con la línea de acento al agarrarla y un brillo suave al encajar en el
 *  ancho por defecto. Doble clic vuelve al ancho default. */
export function SidebarResizeHandle({
  width,
  resizing,
  onPointerDown,
  onDoubleClick,
  onKeyDown,
}: {
  width: number
  resizing: boolean
  onPointerDown: (event: React.PointerEvent) => void
  onDoubleClick: () => void
  onKeyDown: (event: KeyboardEvent) => void
}) {
  const snapped = resizing && width === SIDEBAR_DEFAULT_WIDTH
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ajustar ancho de la barra lateral (flechas ← →, doble clic restaura)"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      className="group absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none select-none"
      title="Arrastra para ajustar el ancho · doble clic restaura"
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 right-0 w-[2px] rounded-full transition-[opacity,box-shadow] ${
          resizing
            ? 'opacity-100 bg-[color:var(--accent-primary)]'
            : 'opacity-0 bg-ink-200 group-hover:opacity-100 group-focus-visible:opacity-100'
        }`}
        style={snapped ? { boxShadow: '0 0 8px 1px var(--accent-primary)' } : undefined}
      />
    </div>
  )
}

/** Clases del `aside` redimensionable: transición serena del ancho para el
 *  reset y el teclado, suspendida durante el arrastre (ahí manda la mano). */
export function sidebarWidthTransitionClass(resizing: boolean): string {
  return resizing
    ? ''
    : 'transition-[width] duration-150 ease-out motion-reduce:transition-none'
}

/** Botón de colapso/expansión: mismo gesto sutil en ambos mundos. */
export function SidebarCollapseButton({
  collapsed,
  label,
  onClick,
}: {
  collapsed: boolean
  label: string
  onClick?: () => void
}) {
  const Icon = collapsed ? ChevronRightIcon : ChevronLeftIcon
  return (
    <IconButton
      onClick={onClick}
      label={label}
      title={label}
      className="touch-target flex size-7 shrink-0 items-center justify-center rounded-md text-ink-300 transition-colors hover:bg-ink-100/70 hover:text-ink-700"
    >
      <Icon size={14} />
    </IconButton>
  )
}

/** Disparador del buscador: idéntico en ambos mundos. */
export function SidebarSearchTrigger({
  label,
  ariaLabel,
  onClick,
}: {
  label?: string
  ariaLabel: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="touch-target w-full flex items-center gap-2 px-2.5 py-1.5 text-caption text-ink-400 hover:text-ink-700 bg-paper-50 hover:bg-paper-100 border border-ink-100/60 hover:border-ink-200 rounded-md transition-colors"
    >
      <SearchIcon size={12} className="shrink-0" />
      <span className="flex-1 text-left leading-none">{label ?? 'Buscar'}</span>
    </button>
  )
}

/** Configuración como ícono (sin texto) con tooltip y dot de alertas. */
export function SidebarSettingsButton({
  onClick,
  alertCount = 0,
  alertTone,
}: {
  onClick: () => void
  alertCount?: number
  alertTone?: string
}) {
  const label =
    alertCount > 0
      ? `Configuración (${alertCount} ${alertCount === 1 ? 'alerta' : 'alertas'})`
      : 'Configuración'
  return (
    <Tooltip content={label} side="top">
      <IconButton
        onClick={onClick}
        label={label}
        className="touch-target relative flex size-8 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100/60 hover:text-ink-800"
      >
        <SettingsIcon size={15} />
        {alertCount > 0 && alertTone && (
          <span
            aria-hidden
            className="absolute right-1 top-1 size-1.5 animate-pulse-subtle rounded-full"
            style={{ backgroundColor: alertTone }}
          />
        )}
      </IconButton>
    </Tooltip>
  )
}

/** Firma del pie: misma tipografía y tono en ambos mundos. */
export function SidebarBrandLine() {
  return (
    <span className="select-none text-micro uppercase tracking-wider text-ink-300">
      trama
      {import.meta.env.VITE_APP_VERSION ? ` · v${import.meta.env.VITE_APP_VERSION}` : ''}
    </span>
  )
}
